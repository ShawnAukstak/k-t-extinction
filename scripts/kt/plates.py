"""Reconstruct present-day points to their past positions with the PALEOMAP plate model.

A small, independent implementation of the standard plate-reconstruction method (as in GPlates):
1. find the plate a point is on (point-in-polygon against the static plate polygons);
2. build that plate's total rotation at time t by interpolating its finite rotation poles (quaternion
   slerp) and composing up the plate hierarchy to the anchor plate;
3. rotate the point.

Data: PALEOMAP global plate model v3 (Scotese, CC BY 4.0), from the PaleoCoastlines Zenodo record.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from .paths import one

Quat = np.ndarray  # (w, x, y, z)


def to_xyz(lat: float, lon: float) -> np.ndarray:
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def to_latlon(v: np.ndarray) -> tuple[float, float]:
    v = v / np.linalg.norm(v)
    return math.degrees(math.asin(max(-1.0, min(1.0, v[2])))), math.degrees(math.atan2(v[1], v[0]))


def pole_quat(lat: float, lon: float, angle: float) -> Quat:
    if angle == 0:
        return np.array([1.0, 0.0, 0.0, 0.0])
    a = to_xyz(lat, lon)
    h = math.radians(angle) / 2
    return np.concatenate([[math.cos(h)], a * math.sin(h)])


def qmul(a: Quat, b: Quat) -> Quat:
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array([
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    ])


def qrot(q: Quat, v: np.ndarray) -> np.ndarray:
    p = np.concatenate([[0.0], v])
    qc = q * np.array([1, -1, -1, -1])
    return qmul(qmul(q, p), qc)[1:]


def slerp(a: Quat, b: Quat, f: float) -> Quat:
    if np.dot(a, b) < 0:
        b = -b
    d = min(1.0, float(np.dot(a, b)))
    if d > 0.9999995:
        q = a + f * (b - a)
        return q / np.linalg.norm(q)
    th = math.acos(d)
    return (math.sin((1 - f) * th) * a + math.sin(f * th) * b) / math.sin(th)


@dataclass
class Pole:
    time: float
    q: Quat
    fixed: int


class RotationModel:
    def __init__(self, path: Path):
        self.seqs: dict[int, list[list[Pole]]] = {}
        current: dict[int, list[Pole]] = {}
        for line in path.read_text(errors="replace").splitlines():
            body = line.split("!")[0].split()
            if len(body) < 6:
                continue
            plate, t, lat, lon, ang, fixed = int(body[0]), float(body[1]), float(body[2]), float(body[3]), float(body[4]), int(body[5])
            if plate == 999:
                continue
            seq = current.get(plate)
            if seq is None or seq[-1].fixed != fixed or t < seq[-1].time:
                seq = []
                self.seqs.setdefault(plate, []).append(seq)
                current[plate] = seq
            seq.append(Pole(t, pole_quat(lat, lon, ang), fixed))

    def _relative(self, plate: int, t: float) -> tuple[Quat, int]:
        for seq in self.seqs.get(plate, []):
            if seq[0].time <= t <= seq[-1].time:
                for a, b in zip(seq, seq[1:]):
                    if a.time <= t <= b.time:
                        f = 0.0 if b.time == a.time else (t - a.time) / (b.time - a.time)
                        return slerp(a.q, b.q, f), a.fixed
        raise KeyError(f"no rotation for plate {plate} at {t} Ma")

    @lru_cache(maxsize=4096)
    def total(self, plate: int, t: float) -> tuple[float, float, float, float]:
        if plate == 0:
            return (1.0, 0.0, 0.0, 0.0)
        q, fixed = self._relative(plate, t)
        qf = np.array(self.total(fixed, t))
        return tuple(qmul(qf, q))


@dataclass
class Polygon:
    plate: int
    ring: np.ndarray       # (n, 3) unit vectors
    lat_range: tuple[float, float]
    lon_range: tuple[float, float]
    crosses_dateline: bool


def _inside(ring: np.ndarray, p: np.ndarray) -> bool:
    """Winding test on the sphere: sum of signed angles subtended at p by each edge.

    Projected onto the tangent plane at p, a ring around the antipode -p winds around p just the
    same, so also require the ring to be on p's side of the globe (every plate polygon is much
    smaller than a hemisphere: |mean of ring| >= 0.66).
    """
    if ring.mean(axis=0) @ p <= 0:
        return False
    a = ring - p * (ring @ p)[:, None]          # project onto the tangent plane at p
    b = np.roll(a, -1, axis=0)
    cross = np.cross(a, b) @ p
    dot = np.einsum("ij,ij->i", a, b)
    total = np.arctan2(cross, dot).sum()
    return abs(total) > math.pi


class PlateModel:
    def __init__(self) -> None:
        base = "paleogeography/paleocoastlines/paleomap_global_plate_model_v3"
        self.rot = RotationModel(one(f"{base}/PALEOMAP_PlateModel.rot"))
        self.polygons = self._read_polygons(one(f"{base}/PALEOMAP_PlatePolygons.gpml"))

    @staticmethod
    def _read_polygons(path: Path) -> list[Polygon]:
        xml = path.read_text(errors="replace")
        polys: list[Polygon] = []
        for feat in xml.split("<gml:featureMember>")[1:]:
            m = re.search(r"<gpml:reconstructionPlateId>.*?<gpml:value>(\d+)</gpml:value>", feat, re.S)
            if not m:
                continue
            plate = int(m.group(1))
            for pl in re.findall(r"<gml:posList[^>]*>([^<]+)</gml:posList>", feat):
                nums = np.array(pl.split(), dtype=float).reshape(-1, 2)  # lat lon pairs
                lat, lon = nums[:, 0], nums[:, 1]
                ring = np.stack([np.cos(np.radians(lat)) * np.cos(np.radians(lon)),
                                 np.cos(np.radians(lat)) * np.sin(np.radians(lon)),
                                 np.sin(np.radians(lat))], -1)
                crosses = (lon.max() - lon.min()) > 180
                polys.append(Polygon(plate, ring, (lat.min(), lat.max()), (lon.min(), lon.max()), crosses))
        return polys

    def plate_of(self, lat: float, lon: float) -> int | None:
        p = to_xyz(lat, lon)
        for poly in self.polygons:
            if not (poly.lat_range[0] - 1e-9 <= lat <= poly.lat_range[1] + 1e-9):
                continue
            if not poly.crosses_dateline and not (poly.lon_range[0] - 1e-9 <= lon <= poly.lon_range[1] + 1e-9):
                continue
            if _inside(poly.ring, p):
                return poly.plate
        return None

    def reconstruct(self, lat: float, lon: float, t: float) -> tuple[float, float, int | None]:
        plate = self.plate_of(lat, lon)
        if plate is None:
            return float("nan"), float("nan"), None
        q = np.array(self.rot.total(plate, float(t)))
        la, lo = to_latlon(qrot(q, to_xyz(lat, lon)))
        return la, lo, plate
