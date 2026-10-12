"""Pre-impact climate fields regridded to the DEM grid.

Source: BRIDGE's HadCM3L run `texyn` (66 Ma, PALEOMAP geography, 576 ppm CO2) as republished in the
PhanDA model priors (Judd et al. 2024; CC BY 4.0): experiment 96 of suite scotese_spinupa, five 20-year
monthly climatologies from the last 100 model years. load_texyn reads BRIDGE's own files (no stated
licence; local comparison only, see data/catalog.yaml).
"""
from __future__ import annotations

from dataclasses import dataclass
from glob import glob

import netCDF4
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates

from .dem import Dem
from .paths import RAW, one

LAPSE_K_PER_M = -6.5e-3
# HadCM3L at 3.75° is too dry over Late Cretaceous continents compared with the fossil record:
# uncalibrated it gives 16 % desert and puts Hell Creek's humid floodplain forests (Tanis) in arid
# shrubland. Scaling precipitation by 1.7 gives ~6 % desert (Chaboureau et al. 2014 estimate ~4 %
# for the Maastrichtian) and wooded Hell Creek. Documented in docs/research/paleogeography.md §1.8.
PRECIP_CALIBRATION = 1.7
SECONDS_PER_YEAR = 365.25 * 86400


@dataclass
class Climate:
    temp_c: np.ndarray     # annual mean 1.5 m air temperature, °C, on the DEM grid
    precip_mm: np.ndarray  # annual precipitation, mm/yr, on the DEM grid
    source: str


def _regrid_periodic(field: np.ndarray, flat: np.ndarray, flon: np.ndarray, dem: Dem) -> np.ndarray:
    """Bicubic interpolation of a coarse global (lat, lon) field onto the DEM grid."""
    if flat[0] < flat[-1]:
        field, flat = field[::-1], flat[::-1]
    # Pad longitudes for wrap-around.
    pad = 3
    f = np.concatenate([field[:, -pad:], field, field[:, :pad]], axis=1)
    dlon = flon[1] - flon[0]
    dlat = flat[0] - flat[1]
    LAT = dem.lat[:, None] * np.ones((1, len(dem.lon)))
    LON = dem.lon[None, :] * np.ones((len(dem.lat), 1))
    i = (flat[0] - LAT) / dlat
    j = np.mod(LON - flon[0], 360.0) / dlon + pad
    out = map_coordinates(f, [i, j], order=1, mode="nearest").astype(np.float32)
    # Blur away the coarse grid's cell pattern (cells are ~25×37 DEM pixels).
    return gaussian_filter(out, sigma=(9, 13), mode=("nearest", "wrap"))


def _phanda_annual(var: str, name: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Annual mean of the five 20-year means (12 months each; the model's 360-day calendar weights them equally)."""
    files = sorted(glob(str(RAW / f"climate/phanda/scotese_spinupa_{var}/scotese_spinupa_096_66Ma_*_{var}.nc")))
    if len(files) != 5:
        raise SystemExit(f"expected 5 PhanDA {var} files, found {len(files)} — run scripts/fetch.py --only phanda_priors")
    fields = []
    for f in files:
        d = netCDF4.Dataset(f)
        fields.append(np.array(d[name][:]).squeeze().mean(axis=0))
        lat, lon = np.array(d["latitude"][:]), np.array(d["longitude"][:])
    return np.mean(fields, axis=0), lat, lon


def load_phanda(dem: Dem) -> Climate:
    t, lat, lon = _phanda_annual("tas", "temp_mm_1_5m")
    p, _, _ = _phanda_annual("pr", "precip_mm_srf")
    return _on_dem(t - 273.15, p * SECONDS_PER_YEAR, lat, lon, dem, "phanda_priors")


def load_texyn(dem: Dem) -> Climate:
    d = netCDF4.Dataset(one("climate/bridge_texyn/texyna.pdclann.nc"))
    lat = np.array(d["latitude"][:])
    lon = np.array(d["longitude"][:])
    t = np.array(d["temp_mm_1_5m"][:]).squeeze() - 273.15
    p = np.array(d["precip_mm_srf"][:]).squeeze() * SECONDS_PER_YEAR  # kg m-2 s-1 → mm/yr
    return _on_dem(t, p, lat, lon, dem, "bridge_texyn")


def _on_dem(t: np.ndarray, p: np.ndarray, lat: np.ndarray, lon: np.ndarray, dem: Dem, source: str) -> Climate:
    """Model-grid temperature (°C) and precipitation (mm/yr) → the DEM grid, calibrated and downscaled."""
    temp = _regrid_periodic(t, lat, lon, dem)
    precip = np.maximum(0, _regrid_periodic(p, lat, lon, dem)) * PRECIP_CALIBRATION
    # Downscale temperature with a lapse rate against the model's (smooth) view of the terrain.
    land = np.maximum(dem.z, 0)
    smooth = gaussian_filter(land, sigma=(12, 18), mode=("nearest", "wrap"))
    temp = temp + LAPSE_K_PER_M * (land - smooth)
    return Climate(temp_c=temp, precip_mm=precip, source=source)
