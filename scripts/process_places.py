#!/usr/bin/env python3
"""Data for "where was my city?": the PALEOMAP plates at 65 Ma and a list of world cities.

    .venv/bin/python scripts/process_places.py

Outputs (app/public/data/places/):
  plates65.json   per-plate total rotation at 65 Ma (quaternion, PALEOMAP frame: x = cos·cos, y = cos·sin,
                  z = sin) and the static plate polygons (lat/lon × 100, integers) to find a point's plate.
  cities.json     [name, country, lat, lon, population] for the largest ~4,000 places (Natural Earth,
                  public domain), with their 65 Ma positions precomputed: [..., paleoLat, paleoLon].
"""
from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

import numpy as np
import shapefile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kt.paths import APP_DATA, RAW  # noqa: E402
from kt.plates import PlateModel  # noqa: E402

T_MA = 65.0
N_CITIES = 4000


def main() -> None:
    model = PlateModel()
    out = APP_DATA / "places"
    out.mkdir(parents=True, exist_ok=True)

    plates = sorted({p.plate for p in model.polygons})
    rotations = {}
    for pid in plates:
        try:
            rotations[str(pid)] = [round(float(x), 9) for x in model.rot.total(pid, T_MA)]
        except KeyError:
            pass
    polys = []
    for p in model.polygons:
        if str(p.plate) not in rotations:
            continue
        lat = np.degrees(np.arcsin(np.clip(p.ring[:, 2], -1, 1)))
        lon = np.degrees(np.arctan2(p.ring[:, 1], p.ring[:, 0]))
        coords = np.round(np.stack([lat, lon], -1).ravel() * 100).astype(int).tolist()
        polys.append({"plate": p.plate, "c": coords})
    (out / "plates65.json").write_text(json.dumps({
        "model": "PALEOMAP v3 (Scotese)", "timeMa": T_MA, "rotations": rotations, "polygons": polys,
        "frame": "x = cos(lat)cos(lon), y = cos(lat)sin(lon), z = sin(lat); quaternion (w, x, y, z)",
        "sources": ["scotese2018"],
    }, separators=(",", ":")))

    shp = glob.glob(str(RAW / "modern/naturalearth/**/*.shp"), recursive=True)[0]
    r = shapefile.Reader(shp)
    rows = []
    for rec in r.iterRecords():
        d = rec.as_dict()
        pop = int(d["pop_max"] or 0)
        # Capitals first among equals, so every country has at least its capital.
        rank = pop + (10_000_000 if d["adm0cap"] else 0)
        rows.append((rank, d["name"] or d["nameascii"], d["adm0name"], float(d["latitude"]), float(d["longitude"]), pop))
    rows.sort(reverse=True)
    cities = []
    for _, name, country, lat, lon, pop in rows[:N_CITIES]:
        pla, plo, plate = model.reconstruct(lat, lon, T_MA)
        if plate is None:
            continue
        cities.append([name, country, round(lat, 3), round(lon, 3), pop, round(pla, 3), round(plo, 3)])
    (out / "cities.json").write_text(json.dumps({
        "fields": ["name", "country", "lat", "lon", "population", "paleoLat", "paleoLon"],
        "timeMa": T_MA, "source": "Natural Earth populated places (public domain)", "cities": cities,
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"plates65.json: {len(rotations)} rotations, {len(polys)} polygons, {(out / 'plates65.json').stat().st_size / 1024:.0f} KB")
    print(f"cities.json: {len(cities)} cities, {(out / 'cities.json').stat().st_size / 1024:.0f} KB")
    for c in cities[:6]:
        print("  ", c)


if __name__ == "__main__":
    main()
