/**
 * "Where was it 66 million years ago?" — find a present-day point's plate and rotate it to 65 Ma with
 * the PALEOMAP model. Port of scripts/kt/plates.py using rotations precomputed for 65 Ma
 * (scripts/process_places.py). Frame: x = cos(lat)cos(lon), y = cos(lat)sin(lon), z = sin(lat).
 */
import type { LatLon } from './geo';

export interface PlatesData {
  timeMa: number;
  rotations: Record<string, [number, number, number, number]>;
  polygons: { plate: number; c: number[] }[];
}

interface Ring {
  plate: number;
  pts: Float64Array; // xyz triples
  latMin: number; latMax: number; lonMin: number; lonMax: number; dateline: boolean;
}

const D = Math.PI / 180;

function xyz(lat: number, lon: number): [number, number, number] {
  const la = lat * D, lo = lon * D;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function inside(ring: Float64Array, p: [number, number, number]): boolean {
  // Winding test on the sphere: sum of signed angles at p subtended by each edge (tangent-plane projection).
  // Projected that way, a ring around the antipode −p winds around p too, so first require the ring to
  // be on p's side of the globe (every plate polygon is much smaller than a hemisphere).
  const n = ring.length / 3;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += ring[3 * i]; my += ring[3 * i + 1]; mz += ring[3 * i + 2]; }
  if (mx * p[0] + my * p[1] + mz * p[2] <= 0) return false;
  let total = 0;
  let ax = 0, ay = 0, az = 0;
  const proj = (i: number): [number, number, number] => {
    const x = ring[3 * i], y = ring[3 * i + 1], z = ring[3 * i + 2];
    const d = x * p[0] + y * p[1] + z * p[2];
    return [x - d * p[0], y - d * p[1], z - d * p[2]];
  };
  [ax, ay, az] = proj(n - 1);
  for (let i = 0; i < n; i++) {
    const [bx, by, bz] = proj(i);
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    total += Math.atan2(cx * p[0] + cy * p[1] + cz * p[2], ax * bx + ay * by + az * bz);
    ax = bx; ay = by; az = bz;
  }
  return Math.abs(total) > Math.PI;
}

export class Plates {
  private readonly rings: Ring[];
  private readonly rotations: PlatesData['rotations'];

  constructor(data: PlatesData) {
    this.rotations = data.rotations;
    this.rings = data.polygons.map((p) => {
      const n = p.c.length / 2;
      const pts = new Float64Array(n * 3);
      let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
      for (let i = 0; i < n; i++) {
        const lat = p.c[2 * i] / 100, lon = p.c[2 * i + 1] / 100;
        const v = xyz(lat, lon);
        pts.set(v, 3 * i);
        latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
        lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon);
      }
      return { plate: p.plate, pts, latMin, latMax, lonMin, lonMax, dateline: lonMax - lonMin > 180 };
    });
  }

  plateOf(lat: number, lon: number): number | null {
    const p = xyz(lat, lon);
    for (const r of this.rings) {
      if (lat < r.latMin - 0.02 || lat > r.latMax + 0.02) continue;
      if (!r.dateline && (lon < r.lonMin - 0.02 || lon > r.lonMax + 0.02)) continue;
      if (inside(r.pts, p)) return r.plate;
    }
    return null;
  }

  /** Present-day position → 65 Ma position, or null when the point is on no plate polygon. */
  reconstruct(lat: number, lon: number): (LatLon & { plate: number }) | null {
    const plate = this.plateOf(lat, lon);
    if (plate === null) return null;
    const q = this.rotations[String(plate)];
    if (!q) return null;
    const [w, x, y, z] = q;
    const [px, py, pz] = xyz(lat, lon);
    // v' = q v q*
    const tx = 2 * (y * pz - z * py), ty = 2 * (z * px - x * pz), tz = 2 * (x * py - y * px);
    const rx = px + w * tx + (y * tz - z * ty);
    const ry = py + w * ty + (z * tx - x * tz);
    const rz = pz + w * tz + (x * ty - y * tx);
    return { lat: Math.asin(Math.max(-1, Math.min(1, rz))) / D, lon: Math.atan2(ry, rx) / D, plate };
  }
}
