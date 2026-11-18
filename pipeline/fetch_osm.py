"""Fetch OpenStreetMap features around each candidate corridor via the Overpass API.

Stdlib only, so it runs anywhere. Output: data/raw/osm_<id>.json
Data (c) OpenStreetMap contributors, ODbL 1.0.
"""
import json, os, sys, time, urllib.parse, urllib.request

RADIUS_M = 20000
MIRRORS = [
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "raw")


def query(lat, lon):
    a = f"(around:{RADIUS_M},{lat},{lon})"
    return f"""[out:json][timeout:240];
(
  node{a}[amenity~"^(hospital|clinic|school|college|university|bank|atm|marketplace|restaurant|cafe|fuel|pharmacy|police)$"];
  node{a}[tourism~"^(hotel|resort|guest_house|attraction|viewpoint)$"];
  node{a}[shop];
  node{a}[railway~"^(station|halt)$"];
  node{a}[aeroway=aerodrome];
  way{a}[building~"^(commercial|retail|industrial|apartments|hotel)$"];
);
out center tags;
way{a}[highway~"^(motorway|trunk|primary|secondary)$"];
out geom tags;
"""


def fetch(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for attempt in range(6):
        url = MIRRORS[(attempt // 2) % len(MIRRORS)]
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "growth-corridor-radar/1.0 (github.com/JiyaSingh18)"})
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa
            last = e
            print(f"  retry {attempt} on {url}: {e}", flush=True)
            time.sleep(15 * (attempt + 1))
    raise RuntimeError(last)


def main():
    os.makedirs(OUT, exist_ok=True)
    corridors = json.load(open(os.path.join(HERE, "corridors.json")))
    only = set(sys.argv[1:])
    for c in corridors:
        if only and c["id"] not in only:
            continue
        path = os.path.join(OUT, f"osm_{c['id']}.json")
        if os.path.exists(path):
            continue
        print("fetching", c["id"], flush=True)
        res = fetch(query(c["lat"], c["lon"]))
        # compact: keep only what we need
        pts, roads = [], []
        for el in res.get("elements", []):
            t = el.get("tags", {})
            if el["type"] == "way" and "geometry" in el and "highway" in t:
                roads.append({"c": t["highway"], "g": [[round(p["lat"], 5), round(p["lon"], 5)] for p in el["geometry"]]})
                continue
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            if lat is None:
                continue
            if "amenity" in t: cat = "amenity:" + t["amenity"]
            elif "tourism" in t: cat = "tourism:" + t["tourism"]
            elif "shop" in t: cat = "shop"
            elif "railway" in t: cat = "rail"
            elif "aeroway" in t: cat = "airport"
            elif "building" in t: cat = "building:" + t["building"]
            else: cat = "other"
            pts.append([round(lat, 5), round(lon, 5), cat])
        json.dump({"id": c["id"], "radius_m": RADIUS_M, "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "osm_base": res.get("osm3s", {}).get("timestamp_osm_base"), "points": pts, "roads": roads}, open(path, "w"))
        print(f"  {len(pts)} points, {len(roads)} road ways", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
