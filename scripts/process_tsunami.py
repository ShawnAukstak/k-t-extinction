#!/usr/bin/env python3
"""Tsunami arrival times and maximum heights on the app's own paleogeography.

    .venv/bin/python scripts/process_tsunami.py

Arrival time: shortest travel time of a long wave (speed √(g·h)) from the crater over the corrected
65 Ma bathymetry — the same "tsunami travel time" method operational warning centres use — computed
as a Dijkstra search on a 0.25° grid with a 16-neighbour stencil and great-circle edge lengths.
Starting condition follows Range et al. (2022): the hydrocode hands a ring wave ~220 km from the
centre to the ocean model at 10 minutes.

Maximum height: Range et al. (2022) MOST run (`MOST_max_output.nc`, CC0), resampled onto our grid
and filled into cells where the two coastlines differ.

Output: app/public/data/effects/tsunami.bin (Uint16 little-endian, 2 × W × H: arrival in units of
4 s, then log10(height m) as (v/1000 − 2)), plus tsunami.json metadata.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import netCDF4
import numpy as np
from scipy.ndimage import distance_transform_edt, map_coordinates
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kt import dem as D  # noqa: E402
from kt.paths import APP_DATA, PROCESSED, one  # noqa: E402

G = 9.81
R = 6_371_000.0
STEP = 0.25
W, H = int(360 / STEP), int(180 / STEP)
CRATER = (25.1149, -71.5823)
HANDOFF_RADIUS_KM = 220.0   # Range et al. 2022: ring wave ~220 km out at the 600 s hand-off
HANDOFF_S = 600.0
MIN_DEPTH_M = 5.0
TIME_UNIT_S = 4.0


def grid_latlon() -> tuple[np.ndarray, np.ndarray]:
    lat = 90 - (np.arange(H) + 0.5) * STEP
    lon = -180 + (np.arange(W) + 0.5) * STEP
    return lat, lon


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(lon2 - lon1)
    h = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.minimum(1, np.sqrt(h)))


def arrival_times(depth: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    ocean = depth > MIN_DEPTH_M
    idx = -np.ones(depth.shape, np.int64)
    idx[ocean] = np.arange(ocean.sum())
    n = int(ocean.sum())
    speed = np.sqrt(G * np.maximum(depth, MIN_DEPTH_M))
    LAT = np.repeat(lat[:, None], W, 1)
    LON = np.repeat(lon[None, :], H, 0)
    rows, cols, wts = [], [], []
    offsets = [(0, 1), (1, 0), (1, 1), (1, -1), (1, 2), (2, 1), (1, -2), (2, -1)]
    for di, dj in offsets:
        i2 = np.arange(H)[:, None] + di
        j2 = (np.arange(W)[None, :] + dj) % W
        valid = (i2 < H) & ocean
        i2c = np.clip(i2, 0, H - 1)
        valid &= ocean[i2c, j2]
        a = idx[valid]
        b = idx[i2c, j2][valid]
        d = haversine(LAT[valid], LON[valid], LAT[i2c, j2][valid], LON[i2c, j2][valid])
        c = 2 / (1 / speed[valid] + 1 / speed[i2c, j2][valid])  # harmonic mean
        t = d / c
        rows += [a, b]
        cols += [b, a]
        wts += [t, t]
    # Virtual source node n, connected to the hand-off ring.
    dist_km = haversine(LAT, LON, CRATER[0], CRATER[1]) / 1000
    src = ocean & (dist_km <= HANDOFF_RADIUS_KM)
    s_idx = idx[src]
    s_t = 150.0 + (HANDOFF_S - 150.0) * dist_km[src] / HANDOFF_RADIUS_KM
    rows.append(np.full(len(s_idx), n))
    cols.append(s_idx)
    wts.append(s_t)
    g = csr_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(n + 1, n + 1))
    tt = dijkstra(g, directed=True, indices=n)
    out = np.full(depth.shape, np.nan)
    out[ocean] = tt[:n]
    out[~np.isfinite(out)] = np.nan
    return out


def most_heights(lat: np.ndarray, lon: np.ndarray, ocean: np.ndarray) -> np.ndarray:
    m = netCDF4.Dataset(one("impact/range2022/MOST_max_output.nc"))
    la = np.array(m["lata"][:])
    lo = np.array(m["lona"][:])
    amp = np.array(m["max_amp_a"][:], dtype=np.float64)
    amp = np.where(np.abs(amp) > 1e30, np.nan, amp) / 100.0  # cm → m
    # MOST grid: lat descending, lon 0…360. Sample at our cell centres.
    LAT = np.repeat(lat[:, None], W, 1)
    LON = np.mod(np.repeat(lon[None, :], H, 0), 360)
    fi = (la[0] - LAT) / (la[0] - la[1])
    fj = (LON - lo[0]) / (lo[1] - lo[0])
    valid = np.isfinite(amp) & (amp > 0)
    # Fill NaN/land in the source grid from the nearest valid cell before sampling.
    _, (ii, jj) = distance_transform_edt(~valid, return_indices=True)
    filled = amp[ii, jj]
    h = map_coordinates(filled, [fi, fj], order=1, mode="nearest")
    h[~ocean] = np.nan
    return h


def main() -> None:
    lat, lon = grid_latlon()
    print("DEM → 0.25° bathymetry")
    dem = D.load()
    LAT = np.repeat(lat[:, None], W, 1)
    LON = np.repeat(lon[None, :], H, 0)
    z = dem.sample(LAT.ravel(), LON.ravel()).reshape(H, W)
    depth = -z
    print("travel times (Dijkstra)…")
    tt = arrival_times(depth, lat, lon)
    ocean = np.isfinite(tt)
    print(f"  ocean cells reached: {ocean.sum():,} / {(depth > MIN_DEPTH_M).sum():,}")
    print("max heights from MOST…")
    hmax = most_heights(lat, lon, ocean)

    # Milestones from Range et al. 2022 to check against.
    checks = {
        "Florida Straits / exit to N Atlantic": (27.5, -66.5),
        "Central American Seaway (Pacific side)": (8.0, -86.0),
        "mid N Atlantic": (35.0, -40.0),
        "N Pacific centre": (30.0, -150.0),
        "Indian Ocean (west of India)": (-20.0, 50.0),
        "Indian Ocean (south-east)": (-35.0, 100.0),
    }
    print("milestones (hours after impact):")
    for name, (la_, lo_) in checks.items():
        i = int((90 - la_) / STEP)
        j = int((lo_ + 180) / STEP)
        print(f"  {name:42s} {tt[i, j] / 3600 if np.isfinite(tt[i, j]) else float('nan'):6.1f} h   max height {hmax[i, j]:7.2f} m")
    for hrs in (1, 4, 24, 48):
        frac = (tt[ocean] <= hrs * 3600).mean()
        print(f"  ocean area reached by {hrs:2d} h: {100 * frac:5.1f} % (cells)")

    # Fill land with the nearest ocean value so bilinear sampling stays smooth at coastlines;
    # the app masks water with its own (finer) coastline.
    _, (ii, jj) = distance_transform_edt(~ocean, return_indices=True)
    tt_f = tt[ii, jj]
    lh = np.log10(np.clip(np.nan_to_num(hmax, nan=0.01), 0.01, 3000))[ii, jj]
    enc_t = np.clip(np.round(tt_f / TIME_UNIT_S), 0, 65534).astype("<u2")
    enc_h = np.clip(np.round((lh + 2) * 1000), 0, 65535).astype("<u2")
    out = APP_DATA / "effects"
    out.mkdir(parents=True, exist_ok=True)
    (out / "tsunami.bin").write_bytes(enc_t.tobytes() + enc_h.tobytes())
    meta = {
        "width": W, "height": H, "stepDeg": STEP, "lat0": 90, "lon0": -180,
        "timeUnitS": TIME_UNIT_S, "landFilled": True,
        "heightEncoding": "log10(m) = v/1000 - 2",
        "sources": ["range2022", "range2022data"],
        "confidence": "model",
        "notes": "Arrival: long-wave travel time on the corrected PALEOMAP 65 Ma bathymetry, starting from Range et al.'s 220 km ring at 600 s. Height: Range et al. 2022 MOST maximum amplitude.",
    }
    (out / "tsunami.json").write_text(json.dumps(meta, indent=1))
    PROCESSED.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
        v = np.where(ocean, np.clip(tt / (48 * 3600), 0, 1), np.nan)
        img = np.zeros((H, W, 3), np.uint8)
        img[ocean] = (np.stack([v, 1 - np.abs(v - 0.5) * 2, 1 - v], -1)[ocean] * 255).astype(np.uint8)
        Image.fromarray(img).save(PROCESSED / "tsunami_arrival_preview.png")
        lv = np.where(ocean, (lh + 2) / 5.3, 0)
        Image.fromarray((np.stack([lv, lv * 0.5, 1 - lv], -1) * 255 * ocean[..., None]).astype(np.uint8)).save(PROCESSED / "tsunami_height_preview.png")
    except Exception as e:  # noqa: BLE001
        print("preview failed:", e)
    print("wrote", out / "tsunami.bin")


if __name__ == "__main__":
    main()
