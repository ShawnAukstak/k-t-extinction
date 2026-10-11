"""Cube-sphere parametrisation — must match app/src/render/cube.ts exactly.

Face order (three.js CubeTexture): 0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z. (s, t) follow the
OpenGL cube-map convention; row 0 of a face image is t = 0. World frame: +Y north pole,
+Z at (0°N, 0°E), +X at (0°N, 90°E).
"""
from __future__ import annotations

import numpy as np

FACE_NAMES = ["px", "nx", "py", "ny", "pz", "nz"]


def face_direction(face: int, s: np.ndarray, t: np.ndarray) -> np.ndarray:
    sc = 2 * s - 1
    tc = 2 * t - 1
    one = np.ones_like(sc)
    if face == 0:
        d = (one, -tc, -sc)
    elif face == 1:
        d = (-one, -tc, sc)
    elif face == 2:
        d = (sc, one, tc)
    elif face == 3:
        d = (sc, -one, -tc)
    elif face == 4:
        d = (sc, -tc, one)
    else:
        d = (-sc, -tc, -one)
    v = np.stack(d, axis=-1)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def face_texel_latlon(face: int, size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(lat, lon, dir) at texel centres of a size×size face; arrays indexed [row(t), col(s)]."""
    c = (np.arange(size) + 0.5) / size
    s, t = np.meshgrid(c, c)  # s varies along columns, t along rows
    d = face_direction(face, s, t)
    lat = np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1)))
    lon = np.degrees(np.arctan2(d[..., 0], d[..., 2]))
    return lat, lon, d


def enu(lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    la, lo = np.radians(lat), np.radians(lon)
    sla, cla, slo, clo = np.sin(la), np.cos(la), np.sin(lo), np.cos(lo)
    e = np.stack([clo, np.zeros_like(lo), -slo], -1)
    n = np.stack([-sla * slo, cla, -sla * clo], -1)
    u = np.stack([cla * slo, sla, cla * clo], -1)
    return e, n, u
