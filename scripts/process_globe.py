#!/usr/bin/env python3
"""Build the globe's base textures from the corrected 65 Ma PaleoDEM and the pre-impact climate.

    .venv/bin/python scripts/process_globe.py            # sizes 256, 512, 1024
    .venv/bin/python scripts/process_globe.py --sizes 256 --preview

Writes app/public/data/globe/<size>/{color,normal}_<face>.webp, height_<face>.png and manifest.json,
plus equirectangular previews in data/processed/globe/. Face layout: scripts/kt/cube.py.

Colour model (documented in docs/research/paleogeography.md §"How we paint the globe"):
- Land: vegetation class from annual temperature and precipitation (HadCM3L 66 Ma). No grassland
  (grasses existed but grasslands did not — open country is fern/shrub savanna).
- Sea: water colour from depth, turquoise over shallow carbonate platforms.
- Relief: object-space normals from the DEM with vertical exaggeration (a visual choice, noted in-app).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kt import climate as C  # noqa: E402
from kt import cube  # noqa: E402
from kt import dem as D  # noqa: E402
from kt.paths import APP_DATA, PROCESSED  # noqa: E402

HEIGHT_STEP_M = 40.0      # the PaleoDEM's own vertical quantisation
HEIGHT_OFFSET = 128       # v = 128 + z/40, so −5120 … +5080 m fits in 8 bits
NORMAL_EXAGGERATION = 6.0

# Linear albedo-like colours, as seen from orbit.
VEG = {
    # Roughly measured visible reflectances (MODIS-like) for comparable modern cover.
    "desert":        (0.33, 0.26, 0.18),
    "arid_shrub":    (0.21, 0.19, 0.12),
    "fern_savanna":  (0.10, 0.13, 0.060),
    "trop_forest":   (0.030, 0.070, 0.026),
    "warm_forest":   (0.042, 0.085, 0.034),
    "cool_forest":   (0.045, 0.072, 0.045),
    "polar_sparse":  (0.15, 0.14, 0.11),
    "rock":          (0.19, 0.17, 0.15),
    "wetland":       (0.032, 0.062, 0.028),
}
SEA = [  # (depth m, colour)
    (0.0, (0.22, 0.52, 0.50)),
    (15.0, (0.12, 0.40, 0.42)),
    (60.0, (0.050, 0.22, 0.28)),
    (200.0, (0.020, 0.10, 0.16)),
    (1000.0, (0.010, 0.050, 0.095)),
    (4000.0, (0.007, 0.032, 0.070)),
]


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a: np.ndarray, b: np.ndarray | tuple, w: np.ndarray) -> np.ndarray:
    return a * (1 - w[..., None]) + np.asarray(b, dtype=np.float32) * w[..., None]


def fbm(shape: tuple[int, int], seed: int, octaves: int = 5) -> np.ndarray:
    """Cheap fractal noise on the equirect grid (wraps in longitude)."""
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = 8 * 2**o
        g = rng.standard_normal((cells // 2 + 2, cells + 2)).astype(np.float32)
        g[:, -2:] = g[:, :2]
        yy = np.linspace(0, g.shape[0] - 2, shape[0])
        xx = np.linspace(0, cells, shape[1], endpoint=False)
        Y, X = np.meshgrid(yy, xx, indexing="ij")
        out += amp * map_coordinates(g, [Y, X], order=3, mode="wrap")
        total += amp
        amp *= 0.55
    return out / total


def land_colour(dem: D.Dem, clim: C.Climate) -> np.ndarray:
    z = dem.z
    T, P = clim.temp_c, clim.precip_mm
    # Moisture index: rain relative to what forest needs at that temperature (cold places need far
    # less — compare today's taiga at 300–800 mm/yr with tropical forest above ~1,500 mm/yr).
    need = 260 + 32 * np.maximum(T, 0)
    m = P / need
    col = np.empty(z.shape + (3,), np.float32)
    col[:] = VEG["desert"]
    col = mix(col, VEG["arid_shrub"], smoothstep(0.30, 0.50, m))
    col = mix(col, VEG["fern_savanna"], smoothstep(0.55, 0.80, m))
    forest = np.empty_like(col)
    forest[:] = VEG["cool_forest"]
    forest = mix(forest, VEG["warm_forest"], smoothstep(6, 14, T))
    forest = mix(forest, VEG["trop_forest"], smoothstep(19, 24, T))
    col = mix(col, forest, smoothstep(0.85, 1.15, m))
    # Very cold, high places: sparse cover.
    col = mix(col, VEG["polar_sparse"], smoothstep(-7, -13, T))
    # Wet coastal lowlands read darker (swamps, deltas).
    lowland = smoothstep(120, 10, z) * smoothstep(1.1, 1.6, m)
    col = mix(col, VEG["wetland"], 0.6 * lowland)
    # Steep or high ground: more rock.
    gy, gx = np.gradient(gaussian_filter(np.maximum(z, 0), 1.0))
    slope = np.hypot(gx, gy) / 11_000.0  # m per m (cells are ~11 km)
    rocky = np.maximum(smoothstep(1800, 3200, z), smoothstep(0.02, 0.06, slope))
    col = mix(col, VEG["rock"], 0.7 * rocky)
    # Natural variation so biomes don't look flat-filled.
    n = fbm(z.shape, seed=6604)
    col *= (1 + 0.18 * n)[..., None]
    return np.clip(col, 0, 1)


def sea_colour(z: np.ndarray) -> np.ndarray:
    depth = np.maximum(0, -z)
    col = np.empty(z.shape + (3,), np.float32)
    col[:] = SEA[0][1]
    for (d0, _), (d1, c1) in zip(SEA[:-1], SEA[1:]):
        w = smoothstep(np.log1p(d0), np.log1p(d1), np.log1p(depth))
        col = mix(col, c1, w)
    return col


def world_normals(dem: D.Dem) -> np.ndarray:
    """Object-space normals on the equirect grid; flat over the sea."""
    land = gaussian_filter(np.maximum(dem.z, 0), 0.8, mode=("nearest", "wrap"))
    dy_m = np.radians(dem.step) * 6_371_000.0
    lat = dem.lat[:, None]
    dx_m = dy_m * np.maximum(np.cos(np.radians(lat)), 0.02)
    dzdx = (np.roll(land, -1, 1) - np.roll(land, 1, 1)) / (2 * dx_m)
    dzdn = (np.roll(land, 1, 0) - np.roll(land, -1, 0)) / (2 * dy_m)  # rows go north→south
    dzdn[0] = dzdn[-1] = 0
    s = NORMAL_EXAGGERATION
    ne, nn, nu = -s * dzdx, -s * dzdn, np.ones_like(land)
    LAT = np.broadcast_to(lat, land.shape)
    LON = np.broadcast_to(dem.lon[None, :], land.shape)
    e, n, u = cube.enu(LAT, LON)
    v = ne[..., None] * e + nn[..., None] * n + nu[..., None] * u
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def sample_equirect(arr: np.ndarray, dem: D.Dem, lat: np.ndarray, lon: np.ndarray, order: int = 1) -> np.ndarray:
    i = (dem.lat[0] - lat) / dem.step
    j = np.mod(lon - dem.lon[0], 360.0) / dem.step
    if arr.ndim == 2:
        a = np.concatenate([arr, arr[:, :1]], axis=1)
        return map_coordinates(a, [i, j], order=order, mode="nearest")
    a = np.concatenate([arr, arr[:, :1]], axis=1)
    return np.stack([map_coordinates(a[..., k], [i, j], order=order, mode="nearest") for k in range(arr.shape[-1])], -1)


def to_srgb8(lin: np.ndarray) -> np.ndarray:
    lin = np.clip(lin, 0, 1)
    s = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    return (s * 255 + 0.5).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", default="256,512,1024")
    ap.add_argument("--preview", action="store_true", help="also write equirect previews")
    args = ap.parse_args()
    sizes = [int(s) for s in args.sizes.split(",")]

    print("loading DEM + corrections")
    dem = D.load()
    print("loading climate (texyn)")
    clim = C.load_texyn(dem)
    print("colouring")
    sea = sea_colour(dem.z)
    land = land_colour(dem, clim)
    # Blend land/sea on a slightly smoothed DEM: shelf cells flicker around 0 m in 40 m steps.
    coast = smoothstep(-25, 25, gaussian_filter(dem.z, 1.2, mode=("nearest", "wrap")))
    colour = sea * (1 - coast[..., None]) + land * coast[..., None]
    normals = world_normals(dem)

    prev_dir = PROCESSED / "globe"
    prev_dir.mkdir(parents=True, exist_ok=True)
    if args.preview:
        Image.fromarray(to_srgb8(colour * 1.8)).resize((2048, 1024), Image.LANCZOS).save(prev_dir / "equirect_colour.png")
        Image.fromarray(((normals * 0.5 + 0.5) * 255).astype(np.uint8)).resize((2048, 1024)).save(prev_dir / "equirect_normals.png")
        print("previews in", prev_dir)

    out_root = APP_DATA / "globe"
    for size in sizes:
        out = out_root / str(size)
        out.mkdir(parents=True, exist_ok=True)
        for f, name in enumerate(cube.FACE_NAMES):
            lat, lon, _ = cube.face_texel_latlon(f, size)
            # Supersample colour 2×2 for smoother minification at small sizes.
            c = sample_equirect(colour, dem, lat, lon)
            Image.fromarray(to_srgb8(c)).save(out / f"color_{name}.webp", quality=88, method=6)
            nrm = sample_equirect(normals, dem, lat, lon)
            nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
            Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(out / f"normal_{name}.webp", quality=92, method=6)
            z = sample_equirect(dem.z, dem, lat, lon)
            v = np.clip(np.round(HEIGHT_OFFSET + z / HEIGHT_STEP_M), 0, 255).astype(np.uint8)
            Image.fromarray(v, mode="L").save(out / f"height_{name}.png", optimize=True)
        kb = sum(p.stat().st_size for p in out.iterdir()) / 1024
        print(f"  {size}: {kb:,.0f} KB")

    manifest = {
        "sizes": sizes,
        "height": {"offset": HEIGHT_OFFSET, "step": HEIGHT_STEP_M},
        "normalExaggeration": NORMAL_EXAGGERATION,
        "source": "PALEOMAP PaleoDEM 65 Ma (Scotese & Wright 2018) with data/curated/dem-corrections.yaml; "
                  f"vegetation from {clim.source}",
    }
    (out_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("wrote", out_root)


if __name__ == "__main__":
    main()
