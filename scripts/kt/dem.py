"""The PALEOMAP 65 Ma PaleoDEM with the curated corrections in data/curated/dem-corrections.yaml."""
from __future__ import annotations

from dataclasses import dataclass

import netCDF4
import numpy as np
import yaml

from .paths import CURATED, one

R_KM = 6371.0


@dataclass
class Dem:
    z: np.ndarray        # metres, [lat, lon], lat descending from +90, lon ascending from -180
    lat: np.ndarray
    lon: np.ndarray
    step: float          # degrees

    def sample(self, lat: np.ndarray, lon: np.ndarray, order: int = 1) -> np.ndarray:
        from scipy.ndimage import map_coordinates
        lat, lon = np.atleast_1d(lat), np.atleast_1d(lon)
        i = (self.lat[0] - lat) / self.step
        j = np.mod(lon - self.lon[0], 360.0) / self.step
        # Pad one wrapped column so bilinear sampling across the antimeridian works.
        zz = np.concatenate([self.z, self.z[:, :1]], axis=1)
        return map_coordinates(zz, [i, j], order=order, mode="nearest")


def load_raw() -> Dem:
    f = one("paleogeography/paleodem/**/*_65Ma.nc")
    d = netCDF4.Dataset(f)
    z = np.array(d["z"][:], dtype=np.float32)
    lat = np.array(d["latitude"][:])
    lon = np.array(d["longitude"][:])
    if lat[0] < lat[-1]:
        z, lat = z[::-1], lat[::-1]
    # Drop the duplicated +180° column so longitude wraps cleanly.
    if np.isclose(lon[-1] - lon[0], 360.0, atol=1e-6) or np.isclose(lon[-1], 180.0, atol=1e-3):
        z, lon = z[:, :-1], lon[:-1]
    return Dem(z=z, lat=lat, lon=lon, step=float(abs(lat[1] - lat[0])))


def _distance_bearing(lat0: float, lon0: float, lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    la0, lo0 = np.radians(lat0), np.radians(lon0)
    la, lo = np.radians(lat), np.radians(lon)
    dlo = lo - lo0
    h = np.sin((la - la0) / 2) ** 2 + np.cos(la0) * np.cos(la) * np.sin(dlo / 2) ** 2
    dist = 2 * R_KM * np.arcsin(np.minimum(1, np.sqrt(h)))
    y = np.sin(dlo) * np.cos(la)
    x = np.cos(la0) * np.sin(la) - np.sin(la0) * np.cos(la) * np.cos(dlo)
    brg = np.degrees(np.arctan2(y, x)) % 360
    return dist, brg


def _smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _value_noise(shape: tuple[int, int], cells: int, seed: int) -> np.ndarray:
    """Smooth noise in [-1, 1] (bicubic upsampled random grid)."""
    from scipy.ndimage import zoom
    rng = np.random.default_rng(seed)
    g = rng.uniform(-1, 1, (cells + 3, cells + 3))
    z = zoom(g, (shape[0] / cells, shape[1] / cells), order=3)
    return np.clip(z[: shape[0], : shape[1]], -1, 1)


def apply_platform(dem: Dem, c: dict) -> None:
    """Flood a carbonate platform: a ramp from shallow to deep across the centre, low platform around."""
    lat0, lon0 = c["centre"]["lat"], c["centre"]["lon"]
    outer = c["outer_radius_km"]
    dlat = outer / 111.0 + 1
    dlon = dlat / max(0.2, np.cos(np.radians(lat0)))
    rows = np.where(np.abs(dem.lat - lat0) <= dlat)[0]
    cols = np.where(np.abs(((dem.lon - lon0 + 180) % 360) - 180) <= dlon)[0]
    LAT = dem.lat[rows][:, None] * np.ones((1, len(cols)))
    LON = dem.lon[cols][None, :] * np.ones((len(rows), 1))
    dist, brg = _distance_bearing(lat0, lon0, LAT, LON)
    z = dem.z[np.ix_(rows, cols)].copy()

    # Along-ramp (x, towards the deep side) and across-ramp (y) coordinates, km.
    ang = np.radians(brg - c["deep_azimuth_deg"])
    x, y = dist * np.cos(ang), dist * np.sin(ang)
    shallow, deep, mid = c["depth_shallow_side_m"], c["depth_deep_side_m"], c["depth_centre_m"]
    ramp = _smoothstep(-c["ramp_half_width_km"], c["ramp_half_width_km"], x)
    depth = shallow + (deep - shallow) * ramp
    # Pin the centre value (the ramp's midpoint is (shallow+deep)/2; nudge it to the observed centre depth).
    depth += (mid - (shallow + deep) / 2) * np.exp(-((x / 120.0) ** 2))
    noise = _value_noise(z.shape, 6, seed=66)
    depth *= 1 + c.get("noise", 0.15) * noise
    marine = -depth

    r_ell = np.sqrt((x / c["ellipse_ratio"]) ** 2 + y**2)
    w_marine = 1 - _smoothstep(c["marine_radius_km"] - c["blend_km"], c["marine_radius_km"], r_ell)
    # Never make water shallower than it already was.
    marine = np.minimum(marine, z)

    # Elsewhere on the block: flatten high ground towards a low platform, fading out at outer_radius_km.
    top = c["platform_top_m"]
    flattened = np.where(z > top, top + (z - top) * 0.08, z)
    w_flat = 1 - _smoothstep(c["marine_radius_km"], outer, dist)
    z_flat = z * (1 - w_flat) + flattened * w_flat

    dem.z[np.ix_(rows, cols)] = z_flat * (1 - w_marine) + marine * w_marine


def load(corrections: bool = True) -> Dem:
    dem = load_raw()
    if corrections:
        spec = yaml.safe_load((CURATED / "dem-corrections.yaml").read_text())
        for c in spec["corrections"]:
            if c["type"] == "platform":
                apply_platform(dem, c)
            else:
                raise SystemExit(f"unknown correction type {c['type']}")
    return dem
