"""Growth Corridor Radar - feature build, model training, explanation and export.

Pipeline
  1. Real features per H3 cell (res 7, ~5 km2) within ~20 km of each corridor:
     OpenStreetMap POI / road / rail density (data/raw/osm_*.json, ODbL),
     distance & timing to catalyst infrastructure (pipeline/infra.json),
     published tourism footfall growth + proxy night-lights growth (pipeline/signals.json).
  2. SYNTHETIC target: 5-year land-price CAGR for historical vintages 2014-2019,
     generated from a transparent, literature-inspired formula + noise.
     (No reliable public plot-level price history exists for these markets.)
  3. Gradient boosting (point + P10/P90 quantile models), leave-one-corridor-out CV,
     linear baseline, SHAP explanations.
  4. Predict 2026->2031 under each scenario; export JSON for the static web app.
"""
import json, math, os
import numpy as np, pandas as pd, h3, shap
from joblib import Parallel, delayed
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "web", "public", "data")
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(18)
RES, K = 7, 8
VINTAGES = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021]  # 5-yr windows ending 2019..2026
PRED_YEAR = 2026

corridors = json.load(open(os.path.join(HERE, "corridors.json")))
infra = json.load(open(os.path.join(HERE, "infra.json")))["items"]
sig = json.load(open(os.path.join(HERE, "signals.json")))


def hav(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def phase(y, ann, opn):
    """How much of a project's effect is 'live' in year y (0..1)."""
    if y < ann:
        return 0.0
    if y < opn:
        return 0.35 + 0.35 * (y - ann) / max(opn - ann, 1)
    age = y - opn
    return 1.0 if age <= 3 else max(0.6, 1.0 - 0.08 * (age - 3))


def tourism_growth(cid, y, override=None):
    if override is not None:
        return override
    t = sig["tourism"][cid]
    if t["kind"] == "proxy":
        return t["growth"]
    s = {int(k): v for k, v in t["series"].items()}
    yrs = sorted(s)
    if y <= yrs[1]:
        # vintage before the published series: use the earliest observed YoY (no look-ahead)
        g = s[yrs[1]] / s[yrs[0]] - 1
        return float(np.clip(g, -0.2, 0.6))
    end = min(y, yrs[-1])
    start = max(end - 3, yrs[0])
    g = (s[end] / s[start]) ** (1 / (end - start)) - 1
    return float(np.clip(g, -0.2, 0.6))


# ---------------- 1. real per-cell OSM features ----------------
rows = []
for c in corridors:
    raw = json.load(open(os.path.join(ROOT, "data", "raw", f"osm_{c['id']}.json")))
    center = h3.latlng_to_cell(c["lat"], c["lon"], RES)
    cells = h3.grid_disk(center, K)
    poi, social, tour, rail_pts = {}, {}, {}, []
    for lat, lon, cat in raw["points"]:
        h = h3.latlng_to_cell(lat, lon, RES)
        poi[h] = poi.get(h, 0) + 1
        if cat in ("amenity:hospital", "amenity:clinic", "amenity:school", "amenity:college", "amenity:university", "amenity:pharmacy"):
            social[h] = social.get(h, 0) + 1
        if cat.startswith("tourism:"):
            tour[h] = tour.get(h, 0) + 1
        if cat == "rail":
            rail_pts.append((lat, lon))
    road = {}
    roadkm_total = {}
    for rw in raw["roads"]:
        g = rw["g"]
        for (a1, o1), (a2, o2) in zip(g[:-1], g[1:]):
            d = hav(a1, o1, a2, o2)
            h = h3.latlng_to_cell((a1 + a2) / 2, (o1 + o2) / 2, RES)
            road[h] = road.get(h, 0) + d
            roadkm_total[rw["c"]] = roadkm_total.get(rw["c"], 0) + d
    c["osm"] = {"poi": len(raw["points"]), "road_km": round(sum(roadkm_total.values()), 1),
                "road_km_by_class": {k: round(v, 1) for k, v in roadkm_total.items()},
                "rail_stations": len(rail_pts), "social": sum(social.values()), "tourism_poi": sum(tour.values()),
                "fetched_utc": raw["fetched_utc"], "osm_base": raw.get("osm_base")}
    for h in cells:
        lat, lon = h3.cell_to_latlng(h)
        ring = h3.grid_disk(h, 1)
        rows.append({
            "h3": h, "corridor": c["id"], "lat": lat, "lon": lon,
            "poi_local": sum(poi.get(x, 0) for x in ring),
            "social_local": sum(social.get(x, 0) for x in ring),
            "road_km_local": sum(road.get(x, 0) for x in ring),
            "rail_km": min([hav(lat, lon, a, o) for a, o in rail_pts] or [40.0]),
            "dist_center_km": hav(lat, lon, c["lat"], c["lon"]),
            "dist_metro_km": min(hav(lat, lon, m["lat"], m["lon"]) for m in sig["metros"]),
            "ntl_growth": sig["ntl_growth_proxy"][c["id"]],
        })
cells_df = pd.DataFrame(rows)
cells_df["rail_km"] = cells_df["rail_km"].clip(upper=40)
for col in ["poi_local", "social_local", "road_km_local"]:
    cells_df["log_" + col] = np.log1p(cells_df[col])

# precompute distances cell -> infra
D = np.array([[hav(la, lo, i["lat"], i["lon"]) for i in infra] for la, lo in zip(cells_df.lat, cells_df.lon)])


def time_features(year, opens=None, tour_override=None):
    opens = opens or {}
    cat = np.zeros(len(cells_df)); near = np.full(len(cells_df), 150.0); yto = np.full(len(cells_df), -8.0)
    for j, it in enumerate(infra):
        opn = opens.get(it["id"], it["open"])
        if year < it["announced"]:
            continue
        cat += it["weight"] * np.exp(-D[:, j] / 25.0) * phase(year, it["announced"], opn)
        closer = D[:, j] < near
        near = np.where(closer, D[:, j], near)
        yto = np.where(closer, np.clip(opn - year, -8, 10), yto)
    tg = cells_df.corridor.map(lambda cid: tourism_growth(cid, year, (tour_override or {}).get(cid)))
    return pd.DataFrame({"catalyst": cat, "nearest_catalyst_km": np.minimum(near, 150), "years_to_open": yto, "tourism_growth": tg.values})


FEATURES = ["catalyst", "nearest_catalyst_km", "years_to_open", "tourism_growth", "ntl_growth",
            "log_poi_local", "log_social_local", "log_road_km_local", "rail_km", "dist_center_km", "dist_metro_km"]
FEATURE_LABELS = {
    "catalyst": "New-infra catalyst index", "nearest_catalyst_km": "Distance to nearest catalyst (km)",
    "years_to_open": "Years until nearest catalyst opens", "tourism_growth": "Tourism footfall growth",
    "ntl_growth": "Night-lights growth (proxy)", "log_poi_local": "OSM amenity & shop density",
    "log_social_local": "Schools/hospitals density", "log_road_km_local": "Major-road km nearby",
    "rail_km": "Distance to rail station (km)", "dist_center_km": "Distance to town centre (km)",
    "dist_metro_km": "Distance to nearest metro (km)"}

# ---------------- 2. synthetic but calibrated target ----------------
corr_effect = {c["id"]: RNG.normal(0, 0.8) for c in corridors}
VINTAGE_MACRO = {2014: -0.5, 2015: -0.8, 2016: -1.5, 2017: -1.0, 2018: -0.3, 2019: 0.6, 2020: 1.0, 2021: 1.4}


def synthetic_cagr(X, corridor, vintage_macro, noise=True):
    yto = X["years_to_open"]
    f = (3.0 + 7.5 * (1 - np.exp(-X["catalyst"] / 0.8))
         + 6.0 * np.clip(X["tourism_growth"], -0.2, 0.6)
         + 5.0 * X["ntl_growth"]
         + 0.8 * X["log_poi_local"] + 0.4 * X["log_road_km_local"]
         - 0.04 * np.minimum(X["rail_km"], 30)
         - 1.2 * X["dist_center_km"] / 20
         - 1.5 * np.clip((X["dist_metro_km"] - 60) / 200, 0, 1.5)
         + 2.0 * np.exp(-((yto - 3) ** 2) / 8) * (yto > 0) * np.exp(-X["nearest_catalyst_km"] / 25)
         # interactions seen in practice: catalysts matter more within commuting reach of a metro,
         # and new airports/landmarks amplify existing tourism demand
         + 2.5 * (1 - np.exp(-X["catalyst"] / 0.8)) * (X["dist_metro_km"] < 120)
         + 5.0 * np.clip(X["tourism_growth"], 0, 0.6) * np.minimum(X["catalyst"], 1.0)
         + corridor.map(corr_effect).values + vintage_macro)
    if noise:
        f = f + RNG.normal(0, 1.3, len(f))
    return np.clip(f, -2, 28)


frames = []
for v in VINTAGES:
    X = pd.concat([cells_df[[f for f in FEATURES if f in cells_df]].reset_index(drop=True), time_features(v)], axis=1)[FEATURES]
    X["corridor"] = cells_df.corridor.values; X["vintage"] = v
    X["cagr_5y"] = synthetic_cagr(X, X["corridor"], VINTAGE_MACRO[v])
    frames.append(X)
train = pd.concat(frames, ignore_index=True)
print("training rows", len(train), "target pct", train.cagr_5y.describe().round(2).to_dict())

# ---------------- 3. model, CV, uncertainty, SHAP ----------------
params = dict(n_estimators=150, max_depth=3, learning_rate=0.05, subsample=0.8, min_samples_leaf=80, random_state=18)
ALPHAS = np.logspace(-2, 3, 20)
Xtr, ytr, groups = train[FEATURES], train.cagr_5y, train.corridor
logo = LeaveOneGroupOut()
oof = np.zeros(len(train)); oof_lo = np.zeros(len(train)); oof_hi = np.zeros(len(train)); oof_lin = np.zeros(len(train))
per_corr = []
class Hybrid:
    """Ridge trend (extrapolates to unseen corridors) + gradient-boosted residuals (non-linearity,
    interactions). Quantile variants boost the residual's P10/P90."""
    def __init__(self, loss="squared_error", alpha=None):
        self.kw = dict(loss=loss, **({"alpha": alpha} if alpha else {}), **params)
    def fit(self, X, y):
        self.lin = RidgeCV(alphas=ALPHAS).fit(X, y)
        self.gb = GradientBoostingRegressor(**self.kw).fit(X, y - self.lin.predict(X))
        self.mu = X.mean().values
        return self
    def predict(self, X):
        return self.lin.predict(X) + self.gb.predict(X)


def _fold(tr, te):
    Xa, ya, Xte = Xtr.iloc[tr], ytr.iloc[tr], Xtr.iloc[te]
    return (te, Hybrid().fit(Xa, ya).predict(Xte), Hybrid("quantile", 0.1).fit(Xa, ya).predict(Xte),
            Hybrid("quantile", 0.9).fit(Xa, ya).predict(Xte), RidgeCV(alphas=ALPHAS).fit(Xa, ya).predict(Xte),
            GradientBoostingRegressor(**{**params, "n_estimators": 400}).fit(Xa, ya).predict(Xte))


oof_gb = np.zeros(len(train))
for te, a, b, c_, d, e in Parallel(n_jobs=-1)(delayed(_fold)(tr, te) for tr, te in logo.split(Xtr, ytr, groups)):
    oof[te], oof_lo[te], oof_hi[te], oof_lin[te], oof_gb[te] = a, b, c_, d, e
    per_corr.append({"corridor": groups.iloc[te[0]], "mae": float(mean_absolute_error(ytr.iloc[te], a))})
metrics = {
    "cv": "Leave-one-corridor-out (13 folds): every corridor is predicted by a model that never saw it",
    "model": "Hybrid: RidgeCV trend + gradient-boosted residuals",
    "gbm": {"r2": r2_score(ytr, oof), "mae": mean_absolute_error(ytr, oof), "rmse": mean_squared_error(ytr, oof) ** 0.5},
    "ridge_baseline": {"r2": r2_score(ytr, oof_lin), "mae": mean_absolute_error(ytr, oof_lin), "rmse": mean_squared_error(ytr, oof_lin) ** 0.5},
    "gbm_only": {"r2": r2_score(ytr, oof_gb), "mae": mean_absolute_error(ytr, oof_gb), "rmse": mean_squared_error(ytr, oof_gb) ** 0.5},
    "interval_coverage_raw_quantile": float(np.mean((ytr >= oof_lo) & (ytr <= oof_hi))),
    "per_corridor_mae": per_corr, "n_rows": len(train), "n_cells": len(cells_df), "vintages": VINTAGES,
    "target_mean": float(ytr.mean()), "target_std": float(ytr.std()), "params": params,
}
# Conformalized quantile regression (CQR): widen P10/P90 by the 80th pct of out-of-corridor
# nonconformity scores, so the band reaches its nominal coverage on unseen corridors.
E = np.maximum(oof_lo - ytr.values, ytr.values - oof_hi)
CQR_Q = float(np.quantile(E, min(1.0, 0.8 * (1 + 1 / len(E)))))
metrics["cqr_widening_pp"] = CQR_Q
metrics["interval_coverage_p10_p90"] = float(np.mean((ytr >= oof_lo - CQR_Q) & (ytr <= oof_hi + CQR_Q)))
metrics = json.loads(json.dumps(metrics, default=float))
print(json.dumps({k: metrics[k] for k in ["gbm", "ridge_baseline", "gbm_only", "interval_coverage_raw_quantile", "interval_coverage_p10_p90", "cqr_widening_pp"]}, indent=1))

model = Hybrid().fit(Xtr, ytr)
q_lo = Hybrid("quantile", 0.1).fit(Xtr, ytr)
q_hi = Hybrid("quantile", 0.9).fit(Xtr, ytr)
tree_expl = shap.TreeExplainer(model.gb)
EXPECTED = float(model.lin.intercept_ + model.lin.coef_ @ model.mu + np.ravel(tree_expl.expected_value)[0])


def shap_values(X):
    """Exact additive attribution: linear part coef*(x - mean) + TreeSHAP of the residual booster."""
    return (X.values - model.mu) * model.lin.coef_ + tree_expl.shap_values(X)


sample = Xtr.sample(2500, random_state=1)
sv = shap_values(sample)
global_imp = sorted([{"feature": f, "label": FEATURE_LABELS[f], "mean_abs_shap": float(np.abs(sv[:, i]).mean())} for i, f in enumerate(FEATURES)], key=lambda d: -d["mean_abs_shap"])
# SHAP dependence data for the top feature (for a scatter in the UI)
top = global_imp[0]["feature"]; ti = FEATURES.index(top)
dep = [{"x": round(float(a), 3), "y": round(float(b), 3)} for a, b in zip(sample[top].values[:600], sv[:600, ti])]

# ---------------- 4. scenarios & 2026 predictions ----------------
SCENARIOS = [
    {"id": "baseline", "name": "Baseline", "desc": "Infra opens on currently reported timelines.", "opens": {}, "tour": {}},
    {"id": "vamc_fast", "name": "Virar–Alibaug corridor fast-tracked", "desc": "Multimodal corridor opens 2029 instead of 2032.", "opens": {"vamc_n": 2029, "vamc_s": 2029}, "tour": {}},
    {"id": "vadhavan_shelved", "name": "Vadhavan port shelved", "desc": "Port is put on hold indefinitely (modelled as opening after 2040).", "opens": {"vadhavan": 2045}, "tour": {}},
    {"id": "nh66_delay", "name": "Mumbai–Goa highway delayed", "desc": "NH-66 widening slips again, from 2027 to 2033.", "opens": {"nh66_mangaon": 2033, "nh66_khed": 2033}, "tour": {}},
    {"id": "jewar_delay", "name": "Noida (Jewar) airport delayed", "desc": "Commercial operations slip from 2026 to 2029.", "opens": {"jewar": 2029}, "tour": {}},
    {"id": "ayodhya_cool", "name": "Ayodhya footfall normalises", "desc": "Tourism growth cools to 8%/yr after the post-2024 surge.", "opens": {}, "tour": {"ayodhya": 0.08}},
]
cell_base = cells_df[[f for f in FEATURES if f in cells_df]].reset_index(drop=True)
scen_out = {}
for s in SCENARIOS:
    X = pd.concat([cell_base, time_features(PRED_YEAR, s["opens"], s["tour"])], axis=1)[FEATURES]
    p50, p10, p90 = model.predict(X), q_lo.predict(X), q_hi.predict(X)
    p10, p90 = np.minimum(p10 - CQR_Q, p50), np.maximum(p90 + CQR_Q, p50)
    scen_out[s["id"]] = {"X": X, "p50": p50, "p10": p10, "p90": p90}

base = scen_out["baseline"]
base_sv = shap_values(base["X"])


def norm(vals):
    v = np.array(vals, float); lo, hi = v.min(), v.max()
    return ((v - lo) / (hi - lo) * 100).round(1) if hi > lo else np.full(len(v), 50.0)


def corridor_agg(sid):
    o = scen_out[sid]; X = o["X"]; res = {}
    for c in corridors:
        m = (cells_df.corridor == c["id"]).values
        res[c["id"]] = {
            "p10": float(np.median(o["p10"][m])), "p50": float(np.median(o["p50"][m])), "p90": float(np.median(o["p90"][m])),
            "catalyst": float(X.catalyst[m].mean()), "tourism_growth": float(X.tourism_growth[m].mean()),
            "years_to_open": float(np.median(X.years_to_open[m])), "nearest_catalyst_km": float(np.median(X.nearest_catalyst_km[m])),
        }
    return res


ids = [c["id"] for c in corridors]
infra_score_raw = [np.log1p(c["osm"]["poi"]) + np.log1p(c["osm"]["road_km"]) + 0.5 * np.log1p(c["osm"]["rail_stations"]) + 0.5 * np.log1p(c["osm"]["social"]) for c in corridors]
pillar_static = {"infrastructure": norm(infra_score_raw),
                 "activity": norm([sig["ntl_growth_proxy"][i] for i in ids]),
                 "affordability": norm([-math.log(sig["land_price_2026_synthetic"][i]) for i in ids])}
scenario_payload = {}
for s in SCENARIOS:
    agg = corridor_agg(s["id"])
    pil = {"catalyst": norm([agg[i]["catalyst"] for i in ids]), "demand": norm([agg[i]["tourism_growth"] for i in ids]),
           "forecast": norm([agg[i]["p50"] for i in ids]), **pillar_static}
    scenario_payload[s["id"]] = {i: {**{k: round(v, 3) for k, v in agg[i].items()},
                                     "pillars": {p: float(pil[p][n]) for p in pil}} for n, i in enumerate(ids)}

infra_by_id = {i["id"]: i for i in infra}
corr_out = []
for c in corridors:
    m = (cells_df.corridor == c["id"]).values
    contrib = base_sv[m].mean(axis=0)
    shap_list = sorted([{"feature": f, "label": FEATURE_LABELS[f], "value": round(float(contrib[k]), 3),
                         "feature_value": round(float(base["X"][f][m].mean()), 3)} for k, f in enumerate(FEATURES)], key=lambda d: -abs(d["value"]))
    near = sorted([(hav(c["lat"], c["lon"], it["lat"], it["lon"]), it) for it in infra])[:3]
    t = sig["tourism"][c["id"]]
    corr_out.append({**{k: c[k] for k in ["id", "name", "state", "lat", "lon", "hoabl"]}, "osm": c["osm"],
                     "ntl_growth_proxy": sig["ntl_growth_proxy"][c["id"]],
                     "land_price_synthetic": sig["land_price_2026_synthetic"][c["id"]],
                     "tourism": {"kind": t["kind"], "latest": (list(t["series"].items())[-1] if "series" in t else None), "unit": t.get("unit"), "src": t.get("src"), "growth_used": round(tourism_growth(c["id"], PRED_YEAR), 3)},
                     "nearby_infra": [{"id": it["id"], "name": it["name"], "km": round(d, 1), "open": it["open"], "kind": it["kind"]} for d, it in near],
                     "shap": shap_list, "shap_base": EXPECTED})

hexes = []
for n, r in cells_df.iterrows():
    hexes.append([r.h3, r.corridor, round(float(base["p50"][n]), 2)] + [round(float(scen_out[s["id"]]["p50"][n]), 2) for s in SCENARIOS[1:]])

json.dump({"generated": pd.Timestamp.now(tz="UTC").isoformat(), "pred_year": PRED_YEAR, "horizon_years": 5,
           "corridors": corr_out, "scenarios": [{k: s[k] for k in ["id", "name", "desc"]} for s in SCENARIOS],
           "scenario_results": scenario_payload, "infra": infra}, open(os.path.join(OUT, "corridors.json"), "w"))
json.dump({"columns": ["h3", "corridor"] + ["p50_" + s["id"] for s in SCENARIOS], "rows": hexes}, open(os.path.join(OUT, "hexes.json"), "w"))
json.dump({"metrics": metrics, "global_importance": global_imp, "dependence": {"feature": top, "label": FEATURE_LABELS[top], "points": dep},
           "features": [{"id": f, "label": FEATURE_LABELS[f]} for f in FEATURES],
           "calibration": {"oof_vs_true": [{"t": round(float(a), 2), "p": round(float(b), 2)} for a, b in zip(ytr.values[::12], oof[::12])]}},
          open(os.path.join(OUT, "model.json"), "w"))
train.sample(400, random_state=2).round(3).to_csv(os.path.join(ROOT, "data", "training_sample.csv"), index=False)
print("exported", len(hexes), "hexes")
for sid in scenario_payload:
    if sid == "baseline": continue
    d = {k: round(scenario_payload[sid][k]["p50"] - scenario_payload["baseline"][k]["p50"], 2) for k in ids}
    print(sid, {k: v for k, v in d.items() if abs(v) > 0.05})
for c in corr_out:
    r = scenario_payload["baseline"][c["id"]]
    print(f"{c['id']:10s} p10 {r['p10']:5.1f} p50 {r['p50']:5.1f} p90 {r['p90']:5.1f}  poi {c['osm']['poi']} roadkm {c['osm']['road_km']}")
