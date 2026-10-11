/**
 * Cube-sphere parametrisation shared with scripts/process_globe.py. Face order and (s, t)
 * orientation follow the OpenGL cube-map convention, so a face image sampled with
 * `textureCube(map, dir)` lines up with geometry built here. Row 0 of each face image is t = 0.
 *
 *   face  0 +X   1 −X   2 +Y   3 −Y   4 +Z   5 −Z      (three.js CubeTexture order)
 */
import { Vector3 } from 'three';

export const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

/** Unit direction for face f at texture coordinates s, t ∈ [0, 1]. */
export function faceDirection(f: number, s: number, t: number, out = new Vector3()): Vector3 {
  const sc = 2 * s - 1;
  const tc = 2 * t - 1;
  switch (f) {
    case 0: out.set(1, -tc, -sc); break;
    case 1: out.set(-1, -tc, sc); break;
    case 2: out.set(sc, 1, tc); break;
    case 3: out.set(sc, -1, -tc); break;
    case 4: out.set(sc, -tc, 1); break;
    default: out.set(-sc, -tc, -1); break;
  }
  return out.normalize();
}

/** Inverse of faceDirection: which face and (s, t) a direction samples. */
export function directionToFace(d: Vector3): { face: number; s: number; t: number } {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  let face: number, sc: number, tc: number, ma: number;
  if (ax >= ay && ax >= az) {
    ma = ax;
    if (d.x > 0) { face = 0; sc = -d.z; tc = -d.y; } else { face = 1; sc = d.z; tc = -d.y; }
  } else if (ay >= az) {
    ma = ay;
    if (d.y > 0) { face = 2; sc = d.x; tc = d.z; } else { face = 3; sc = d.x; tc = -d.z; }
  } else {
    ma = az;
    if (d.z > 0) { face = 4; sc = d.x; tc = -d.y; } else { face = 5; sc = -d.x; tc = -d.y; }
  }
  return { face, s: (sc / ma + 1) / 2, t: (tc / ma + 1) / 2 };
}
