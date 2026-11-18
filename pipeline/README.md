# Data & model pipeline

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r pipeline/requirements.txt
python pipeline/fetch_osm.py          # ~5 min; OpenStreetMap via Overpass -> data/raw/osm_<id>.json (cached)
python pipeline/build_and_train.py    # ~1 min on 8 cores -> web/public/data/{corridors,hexes,model}.json
```

| File | What it holds | Status |
|---|---|---|
| `corridors.json` | 13 candidate corridors (lat/lon, HoABL flag) | real coordinates |
| `infra.json` | 19 catalyst projects with announced / open years + source links | real projects, dates are assumptions |
| `signals.json` → `tourism` | Ayodhya, Mathura, Goa footfall series (published) and proxies for the rest | mixed, each flagged |
| `signals.json` → `ntl_growth_proxy` | night-lights growth stand-ins | **proxy** |
| `signals.json` → `land_price_2026_synthetic` | indicative ₹/sq ft | **synthetic** |
| `data/raw/osm_*.json` | OSM points + major-road geometries within 20 km | real (ODbL) |

## Replacing the night-lights proxy with measured VIIRS
1. Create a free NASA Earthdata account and token.
2. Download Black Marble `VNP46A4` annual tiles for 2019 and 2024 covering India (tiles h25v06, h25v07, h26v06, h26v07).
3. For each H3 cell, average `NearNadir_Composite_Snow_Free` radiance; growth = r2024 / r2019 − 1.
4. Write the per-corridor (or per-cell) values into `signals.json` and re-run `build_and_train.py`.

## Replacing the synthetic target with real prices
Swap `synthetic_cagr()` for a join against real transaction data (IGR Maharashtra ready-reckoner / registration rates, UP stamp-duty circle rates, or internal sales data) keyed by H3 cell and year. Nothing else changes.
