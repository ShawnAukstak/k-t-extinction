#!/usr/bin/env python3
"""Bake time-dependent impact effects into small files the app interpolates.

    .venv/bin/python scripts/process_effects.py

Outputs (app/public/data/effects/):
  dust.json   Ejecta/dust cloud column density vs angular distance from the crater, at keyframe times.
              0–3600 s from Artemieva & Morgan (2020) FIG 2 (axisymmetric dust density fields);
              later keyframes extrapolated so the cloud encircles Earth in ~4.5 h (Morgan et al. 2022)
              with re-entry concentrated at the antipode (Kring & Durda 2002), then falling out.

  winter_<scenario>.bin/.json
              Impact winter from Tabor et al. (2020) CESM runs (soot, SO2, dust): per keyframe month,
              surface sunlight as a fraction of the pre-impact control (same calendar month) and
              surface temperature (°C). Grid 144 × 96 (2.5° × 1.9°), lon from 0°E, rows south → north.

Everything here is "model" confidence and documented in docs/research/timeline.md §2 and §8.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter1d

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kt.paths import APP_DATA, RAW  # noqa: E402

R_KM = 6371.0
N_BINS = 256                       # angular bins 0…180°
ANTIPODE_KM = np.pi * R_KM         # 20,015 km
ENCIRCLE_S = 4.5 * 3600            # Morgan et al. 2022: "within 4–5 h"
FALLOUT_TAU_S = 12 * 3600          # coarse ejecta settles over hours to days (Schulte 2010; Kring & Durda 2002)
FLOOR = 1e-4                       # kg/m², treated as clear


def artemieva_columns() -> dict[float, tuple[np.ndarray, np.ndarray]]:
    """{t: (x_km, column kg/m²)} for each FIG 2 keyframe."""
    out = {}
    for f in sorted((RAW / "impact/artemieva2020/FIG_2/FIG_2").glob("rho_dust_*.dat")):
        t = float(f.stem.split("_")[-1])
        a = np.loadtxt(f, skiprows=1)
        x = np.unique(a[:, 0])
        z = np.unique(a[:, 1])
        if not np.allclose(a[: len(z), 0], x[0]):
            raise SystemExit(f"unexpected ordering in {f}")
        rho = a[:, 2].reshape(len(x), len(z))
        col = rho.sum(1) * (z[1] - z[0]) * 1000.0  # kg/m²
        out[t] = (x, col)
    return out


def front_km(x: np.ndarray, col: np.ndarray, thr: float = 1e-3) -> float:
    idx = np.where(col > thr)[0]
    return float(x[idx[-1]]) if len(idx) else 0.0


MONTH_S = 365.25 * 86400 / 12
WINTER_SCENARIOS = {"soot": "soot_mon_20yr.nc", "so2": "SO2_mon_20yr.nc", "dust": "dust_mon_20yr.nc"}


def winter_keyframes() -> list[int]:
    """Model months to keep: monthly for 3 years, then quarterly to 10 years, then half-yearly."""
    return list(range(0, 36)) + list(range(36, 120, 3)) + list(range(120, 240, 6))


def bake_winter() -> None:
    import netCDF4
    base = RAW / "impact/tabor2020"
    c = netCDF4.Dataset(base / "cntl_mon_30yr.nc")
    Fc = np.array(c["FSDS"][:, 0], dtype=np.float64)
    out = APP_DATA / "effects"
    months = winter_keyframes()
    for name, fname in WINTER_SCENARIOS.items():
        d = netCDF4.Dataset(base / fname)
        F = np.array(d["FSDS"][:, 0], dtype=np.float64)
        TS = np.array(d["TS"][:, 0], dtype=np.float64) - 273.15
        layers = []
        # Layer 0 is the pre-impact state (full light, control temperature in the impact month).
        Tc = np.array(c["TS"][:, 0], dtype=np.float64) - 273.15
        layers.append((np.ones_like(Fc[0]), Tc[3]))
        lat = np.array(c["lat"][:])
        wlat = np.cos(np.radians(lat))[:, None] * np.ones(Fc.shape[1:])
        for m in months:
            fc = Fc[m % 12]
            lit = fc > 40.0  # W/m²; in polar night the ratio is 0/0
            frac = np.where(lit, F[m] / np.maximum(fc, 1e-6), np.nan)
            # Aerosols spread around the globe within days, so where the control is dark use the
            # month's global mean over sunlit cells.
            gmean = np.nansum(frac * wlat) / np.sum(wlat[lit])
            frac = np.clip(np.where(lit, frac, gmean), 0, 1)
            layers.append((frac, TS[m]))
        light = np.stack([l for l, _ in layers])
        temp = np.stack([t for _, t in layers])
        r = np.clip(np.round(light * 255), 0, 255).astype(np.uint8)
        g = np.clip(np.round((temp + 60.0) * 2.55), 0, 255).astype(np.uint8)
        rg = np.stack([r, g], -1)  # [layer, lat(S→N), lon(0→360), 2]
        (out / f"winter_{name}.bin").write_bytes(rg.tobytes())
        times = [0.0] + [(m + 0.5) * MONTH_S for m in months]
        meta = {
            "scenario": name, "width": int(rg.shape[2]), "height": int(rg.shape[1]), "layers": int(rg.shape[0]),
            "times": times, "lon0": 0.0, "latSouthFirst": True,
            "encoding": "R: sunlight fraction ×255; G: surface temperature °C = v/2.55 − 60",
            "sources": ["tabor2020", "tabor2020data"], "confidence": "contested",
        }
        (out / f"winter_{name}.json").write_text(json.dumps(meta))
        w = np.cos(np.radians(np.array(c["lat"][:])))[:, None] * np.ones(light.shape[1:])
        w /= w.sum()
        print(f"winter_{name}: {rg.shape[0]} layers, {rg.nbytes / 1e6:.1f} MB; "
              f"global light at 1 yr {(light[12] * w).sum():.2f}, 3 yr {(light[36 - 0] * w).sum():.2f}")


def main() -> None:
    bake_winter()
    cols = artemieva_columns()
    bins_km = (np.arange(N_BINS) + 0.5) / N_BINS * ANTIPODE_KM
    rows: dict[float, np.ndarray] = {0.0: np.full(N_BINS, FLOOR)}

    for t, (x, col) in cols.items():
        prof = np.interp(bins_km, x, col, right=FLOOR)
        rows[t] = np.maximum(prof, FLOOR)

    # Before the first keyframe: the same shape, compressed to the front at that time (ejecta move ~2–4 km/s).
    t_first = min(cols)
    x0, c0 = cols[t_first]
    for t in (20.0, 60.0, 120.0):
        s = t / t_first
        prof = np.interp(bins_km / s, x0, c0, right=FLOOR) * (1 / s) ** 0.5
        rows[t] = np.maximum(prof, FLOOR)

    # After the last keyframe: the front advances to the antipode by ENCIRCLE_S; behind it the cloud
    # thins as it spreads and falls out. Re-entry concentrates near the antipode (Kring & Durda 2002).
    t_last = max(cols)
    xl, cl = cols[t_last]
    fl = front_km(xl, cl)
    tail = float(cl[-20:].mean())
    for t in (2 * 3600.0, 3 * 3600.0, ENCIRCLE_S, 6 * 3600.0, 8 * 3600.0, 12 * 3600.0, 24 * 3600.0, 48 * 3600.0, 96 * 3600.0):
        frac = min(1.0, (t - t_last) / (ENCIRCLE_S - t_last))
        front = fl + (ANTIPODE_KM - fl) * frac
        base = np.interp(bins_km, xl, cl, right=tail)
        base = np.where(bins_km <= front, base, FLOOR)
        # spreading: the near field drains outward
        spread = (t_last / t) ** 0.6
        prof = base * spread
        if frac >= 1.0:
            antipode_focus = 1 + 2.5 * np.exp(-(((ANTIPODE_KM - bins_km) / 2500.0) ** 2)) * np.exp(-(t - ENCIRCLE_S) / (8 * 3600))
            prof = np.maximum(prof, tail * spread) * antipode_focus
        prof *= np.exp(-max(0.0, t - t_last) / FALLOUT_TAU_S)
        rows[t] = np.maximum(prof, FLOOR)

    # The hydrocode fields contain thin density shells; smooth radially (~200 km) in log space so the
    # globe shows the cloud's extent and thinning rather than numerical banding.
    for t in rows:
        rows[t] = np.power(10.0, gaussian_filter1d(np.log10(rows[t]), sigma=2.5, mode="nearest"))

    times = sorted(rows)
    data = {
        "description": "Ejecta/dust cloud column density (kg/m²) vs angular distance from the crater.",
        "sources": ["artemieva2020", "artemieva2020data", "morgan2022", "kring2002"],
        "confidence": "model",
        "bins": N_BINS,
        "maxAngleDeg": 180,
        "times": times,
        "log10Column": [np.round(np.log10(rows[t]), 3).tolist() for t in times],
        "notes": f"0–{int(t_last)} s from Artemieva & Morgan 2020 FIG 2; later times extrapolated to encircle Earth at {ENCIRCLE_S/3600:.1f} h with e-folding fallout {FALLOUT_TAU_S/3600:.0f} h.",
    }
    out = APP_DATA / "effects"
    out.mkdir(parents=True, exist_ok=True)
    (out / "dust.json").write_text(json.dumps(data))
    print(f"dust.json: {len(times)} keyframes; front at {t_last:.0f} s = {fl:.0f} km")
    for t in times:
        r = rows[t]
        f = bins_km[np.where(r > 1e-3)[0][-1]] if (r > 1e-3).any() else 0
        print(f"  t={t:8.0f} s  front≈{f:7.0f} km  max={r.max():9.3g} kg/m²")


if __name__ == "__main__":
    main()
