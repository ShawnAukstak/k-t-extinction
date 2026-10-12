/**
 * Cretaceous plants, built procedurally (no model files): trunks and branches as tapered tubes,
 * foliage as cut-out cards textured from the procedural atlas (foliage-atlas.ts) — leaf sprays on
 * rounded crowns, drooping needle sprays in whorls, arching fronds as bent strips. Proportions are
 * generic and stylised ("chosen"); the mix of forms follows the fossil record: angiosperm trees
 * dominant in warm lowlands, conifers (taxodiaceous, araucarian, podocarp) widespread and dominant
 * when cool, fan palms (Sabalites) in the warm south, tree ferns, cycads and ferns in the understorey,
 * horsetails in wet ground. No grass: grasses existed but did not form grasslands until much later.
 *
 * Attributes: position, normal, uv (atlas), part (0 wood, 1 foliage), aCrown (the crown's "volume"
 * normal, for soft lighting of the cards), aAO (ambient occlusion: dark inside crowns, light outside).
 * Units: metres, base at the origin, +y up.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { TILE, tileUV } from './foliage-atlas';

export type PlantKind = 'conifer' | 'araucaria' | 'broadleaf' | 'palm' | 'treefern' | 'cycad' | 'shrub' | 'fern' | 'horsetail';

/** 'hi' near the camera; 'lo' (about a third of the cards, each larger) for distant cells. */
export type PlantLod = 'hi' | 'lo';

class Builder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; part: number[] = []; crown: number[] = []; ao: number[] = []; idx: number[] = [];
  private vert(p: Vector3, n: Vector3, u: number, v: number, part: number, c: Vector3, ao: number): number {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.part.push(part); this.crown.push(c.x, c.y, c.z); this.ao.push(ao);
    return this.part.length - 1;
  }

  /** A tapered tube (trunk or branch). */
  tube(p0: Vector3, p1: Vector3, r0: number, r1: number, sides: number, ao0 = 0.65, ao1 = 1): void {
    const axis = new Vector3().subVectors(p1, p0).normalize();
    const ref = Math.abs(axis.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const a = new Vector3().crossVectors(axis, ref).normalize(), b = new Vector3().crossVectors(axis, a);
    const base = this.part.length;
    for (let ring = 0; ring < 2; ring++) {
      const c = ring ? p1 : p0, r = ring ? r1 : r0;
      for (let j = 0; j <= sides; j++) {
        const th = (j / sides) * Math.PI * 2;
        const n = a.clone().multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th));
        this.vert(c.clone().addScaledVector(n, r), n, j / sides, ring, 0, n, ring ? ao1 : ao0);
      }
    }
    for (let j = 0; j < sides; j++) {
      const i0 = base + j, i1 = base + j + 1, i2 = base + sides + 1 + j, i3 = base + sides + 2 + j;
      this.idx.push(i0, i2, i1, i1, i2, i3);
    }
  }

  /** A flat card from its base point along `dir` (length len), width `wid` across `side`. */
  card(base: Vector3, dir: Vector3, side: Vector3, len: number, wid: number, tile: number, crownN: Vector3, ao: number): void {
    const [u0, v0, u1, v1] = tileUV(tile);
    const n = new Vector3().crossVectors(side, dir).normalize();
    const s = side.clone().multiplyScalar(wid / 2);
    const tip = base.clone().addScaledVector(dir, len);
    const i = this.vert(base.clone().sub(s), n, u0, v0, 1, crownN, ao * 0.85);
    this.vert(base.clone().add(s), n, u1, v0, 1, crownN, ao * 0.85);
    this.vert(tip.clone().sub(s), n, u0, v1, 1, crownN, ao);
    this.vert(tip.clone().add(s), n, u1, v1, 1, crownN, ao);
    this.idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }

  /** A bent strip (an arching frond) through points, with widths, textured along its length. */
  strip(pts: Vector3[], widths: number[], up: Vector3, tile: number, crownN: Vector3, ao: number): void {
    const [u0, v0, u1, v1] = tileUV(tile);
    let total = 0;
    const lens = [0];
    for (let i = 1; i < pts.length; i++) { total += pts[i].distanceTo(pts[i - 1]); lens.push(total); }
    const base = this.part.length;
    for (let i = 0; i < pts.length; i++) {
      const t = new Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      const side = new Vector3().crossVectors(t, up).normalize();
      const n = new Vector3().crossVectors(side, t).normalize();
      const v = v0 + (v1 - v0) * (lens[i] / total);
      const w = widths[i] / 2;
      this.vert(pts[i].clone().addScaledVector(side, -w), n, u0, v, 1, crownN, ao);
      this.vert(pts[i].clone().addScaledVector(side, w), n, u1, v, 1, crownN, ao);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('part', new BufferAttribute(new Float32Array(this.part), 1));
    g.setAttribute('aCrown', new BufferAttribute(new Float32Array(this.crown), 3));
    g.setAttribute('aAO', new BufferAttribute(new Float32Array(this.ao), 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const UP = V(0, 1, 0);

/** A random unit vector. */
function randDir(r: () => number): Vector3 {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return V(s * Math.cos(a), z, s * Math.sin(a));
}

/** A rounded crown lobe filled with leaf-spray cards facing outward. */
function lobe(b: Builder, c: Vector3, r: number, cards: number, tile: number, rand: () => number, size = 1): void {
  for (let i = 0; i < cards; i++) {
    let d = randDir(rand);
    d.y = d.y * 0.8 + 0.25;  // fewer cards underneath
    d = d.normalize();
    const depth = 0.55 + 0.45 * rand();
    const p = c.clone().addScaledVector(d, r * depth);
    // Sprays point outward and upward, turned randomly about that direction.
    const dir = d.clone().multiplyScalar(0.7).add(V(rand() - 0.5, 0.6, rand() - 0.5)).normalize();
    let side = new Vector3().crossVectors(dir, d);
    if (side.lengthSq() < 1e-4) side = new Vector3().crossVectors(dir, V(1, 0, 0));
    side.normalize().applyAxisAngle(dir, (rand() - 0.5) * 1.2);
    const len = r * (0.9 + 0.4 * rand()) * size;
    const base = p.clone().addScaledVector(dir, -len * 0.45);
    b.card(base, dir, side, len, len * 0.5, tile, d, 0.45 + 0.55 * depth * (0.6 + 0.4 * (d.y * 0.5 + 0.5)));
  }
}

/** An arching frond from `base` heading `azimuth`, starting `elev0` above horizontal and drooping to `elev1`. */
function frond(b: Builder, base: Vector3, azimuth: number, elev0: number, elev1: number, len: number, wid: number, tile: number, segs: number, ao = 1): void {
  const pts = [base.clone()];
  const widths = [wid * 0.35];
  const h = V(Math.cos(azimuth), 0, Math.sin(azimuth));
  const p = base.clone();
  for (let i = 1; i <= segs; i++) {
    const t = (i - 0.5) / segs;
    const e = elev0 + (elev1 - elev0) * t;
    p.addScaledVector(h.clone().multiplyScalar(Math.cos(e)).add(V(0, Math.sin(e), 0)), len / segs);
    pts.push(p.clone());
    widths.push(wid * Math.sin(Math.PI * Math.min(1, 0.25 + 0.75 * (i / segs))) + 0.02);
  }
  b.strip(pts, widths, UP, tile, h.clone().add(V(0, 0.6, 0)).normalize(), ao);
}

export function plantGeometry(kind: PlantKind, lod: PlantLod = 'hi'): BufferGeometry {
  const b = new Builder();
  const lo = lod === 'lo';
  // Fewer, larger cards far away: the same silhouette and coverage for a third of the triangles.
  const cards = (n: number) => (lo ? Math.max(3, Math.round(n * 0.35)) : n);
  const grow = lo ? 1.35 : 1;
  const sides = lo ? 4 : 7;
  const r = rng({ conifer: 3, araucaria: 5, broadleaf: 7, palm: 11, treefern: 13, cycad: 17, shrub: 19, fern: 23, horsetail: 29 }[kind]);
  switch (kind) {
    case 'broadleaf': {
      // Angiosperm tree, ~18 m: a trunk forking into a few limbs under a broad, lumpy crown.
      b.tube(V(0, 0, 0), V(0, 8, 0), 0.55, 0.35, sides);
      const lobes: [number, number, number, number][] = [[0, 12.5, 0, 5], [3, 11, 1.2, 3.6], [-2.8, 11.5, -1.4, 3.8], [0.8, 14.8, -1.6, 3.4], [-1, 10.2, 2.6, 3.1]];
      if (!lo) for (const [x, y, z, rad] of lobes.slice(1)) b.tube(V(0, 7.5, 0), V(x * 0.7, y - rad * 0.6, z * 0.7), 0.28, 0.12, 5, 0.6, 0.6);
      for (const [x, y, z, rad] of lobes) lobe(b, V(x, y, z), rad, cards(Math.round(rad * 3)), r() < 0.5 ? TILE.broadleaf : TILE.broadleafLobed, r, grow);
      break;
    }
    case 'conifer': {
      // Taxodiaceous (Metasequoia-like), ~25 m: narrow cone of drooping branch sprays in whorls.
      b.tube(V(0, 0, 0), V(0, 25, 0), 0.5, 0.06, sides);
      let az = 0;
      for (let y = 3.5; y < 24.5; y += lo ? 3.2 : 1.5) {
        const k = (y - 3.5) / 21;
        const R = 3.8 * Math.pow(1 - k, 0.9) + 0.5;
        for (let i = 0; i < (lo ? 4 : 5); i++) {
          az += 2.39996; // golden angle
          const dir = V(Math.cos(az), -0.28 - 0.15 * r(), Math.sin(az)).normalize();
          const side = new Vector3().crossVectors(dir, UP).normalize().applyAxisAngle(dir, (r() - 0.5) * 0.9);
          b.card(V(0, y, 0), dir, side, R * 1.2 * (lo ? 1.1 : 1), R * 0.6 * grow, TILE.conifer, dir.clone().add(V(0, 0.5, 0)).normalize(), 0.55 + 0.45 * k + 0.1 * r());
        }
      }
      for (let i = 0; i < 2; i++) b.card(V(0, 23.5, 0), UP, V(Math.cos(i * 1.57), 0, Math.sin(i * 1.57)), 2.6, 1.3, TILE.conifer, UP, 1);
      break;
    }
    case 'araucaria': {
      // Araucarian, ~30 m: tall bare trunk, horizontal tiers of scale-leaved branches near the top.
      b.tube(V(0, 0, 0), V(0, 30, 0), 0.6, 0.08, sides);
      let az = 0.4;
      for (let y = 17; y < 29.5; y += lo ? 2.6 : 1.25) {
        const k = (y - 17) / 12.5;
        const R = 4.2 * (1 - 0.65 * k) + 0.6;
        for (let i = 0; i < 5; i++) {
          az += 2.39996;
          const dir = V(Math.cos(az), 0.05 - 0.1 * r(), Math.sin(az)).normalize();
          b.card(V(0, y, 0), dir, new Vector3().crossVectors(dir, UP).normalize().applyAxisAngle(dir, 1.2 + (r() - 0.5) * 0.6), R * 1.1, R * 0.55, TILE.coniferScale, dir.clone().add(V(0, 0.4, 0)).normalize(), 0.6 + 0.4 * k);
        }
      }
      break;
    }
    case 'palm': {
      // Fan palm (Sabalites), ~12 m: a slightly leaning trunk, a crown of costapalmate fans.
      const top = V(0.6, 11.5, 0.2);
      b.tube(V(0, 0, 0), V(0.3, 6, 0.1), 0.34, 0.28, 7);
      b.tube(V(0.3, 6, 0.1), top, 0.28, 0.24, 7);
      const nf = lo ? 7 : 14;
      for (let i = 0; i < nf; i++) {
        const az = (i / nf) * Math.PI * 2 + r() * 0.3;
        const elev = 1.2 - (i % 3) * 0.5 - r() * 0.3;
        const dir = V(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
        // The fan faces up and out: its width runs around the crown.
        const side = V(-Math.sin(az), 0, Math.cos(az));
        b.card(top, dir, side, 3.3 * (lo ? 1.15 : 1), 3.3 * 0.5 * 1.6 * grow, TILE.palm, dir.clone().add(V(0, 0.4, 0)).normalize(), 0.75 + 0.25 * Math.sin(elev));
      }
      break;
    }
    case 'treefern': {
      const top = V(0, 4.6, 0);
      b.tube(V(0, 0, 0), top, 0.22, 0.18, 6);
      const nf = lo ? 6 : 12;
      for (let i = 0; i < nf; i++) frond(b, top, (i / nf) * Math.PI * 2 + r() * 0.4, 0.9 - 0.2 * r(), -0.5 - 0.3 * r(), 3.1, 0.95 * grow, TILE.fern, lo ? 2 : 4);
      break;
    }
    case 'cycad': {
      const top = V(0, 1.5, 0);
      b.tube(V(0, 0, 0), top, 0.42, 0.36, 7);
      const nf = lo ? 7 : 14;
      for (let i = 0; i < nf; i++) frond(b, top, (i / nf) * Math.PI * 2 + r() * 0.3, 0.75 + 0.2 * r(), 0.25, 1.7, 0.55 * grow, TILE.cycad, lo ? 1 : 2);
      break;
    }
    case 'fern': {
      // Ground fern clump, ~1.3 m: understorey before and after, and the colonisers of the fern spike.
      const nf = lo ? 4 : 9;
      for (let i = 0; i < nf; i++) frond(b, V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), (i / nf) * Math.PI * 2 + r() * 0.5, 1.15 - 0.2 * r(), -0.3, 1.4, 0.6 * grow, TILE.fern, lo ? 2 : 3, 0.85);
      break;
    }
    case 'horsetail': {
      // Equisetum: a clump of jointed stems (wet ground).
      for (let i = 0; i < (lo ? 2 : 3); i++) {
        const a = (i / (lo ? 2 : 3)) * Math.PI;
        b.card(V(0, 0, 0), UP, V(Math.cos(a), 0, Math.sin(a)), 1.3, 0.65, TILE.horsetail, UP, 0.9);
      }
      break;
    }
    case 'shrub':
    default: {
      for (let i = 0; i < 3; i++) b.tube(V(0, 0, 0), V((r() - 0.5) * 1.2, 1.0, (r() - 0.5) * 1.2), 0.08, 0.04, 4, 0.5, 0.6);
      lobe(b, V(0, 1.1, 0), 1.3, cards(16), TILE.broadleaf, r, 1.1 * grow);
      break;
    }
  }
  return b.build();
}

/** Which plants grow in each vegetation class, with relative weights (by temperature where relevant). */
export function plantMix(cls: string, tempC: number): [PlantKind, number][] {
  const warm = Math.min(1, Math.max(0, (tempC - 12) / 12));
  switch (cls) {
    case 'tropical_forest': return [['broadleaf', 0.55], ['palm', 0.2], ['treefern', 0.15], ['cycad', 0.1]];
    case 'warm_forest': return [['broadleaf', 0.45], ['conifer', 0.2 - 0.1 * warm], ['araucaria', 0.1 - 0.05 * warm], ['palm', 0.1 * warm], ['treefern', 0.08], ['cycad', 0.07]];
    case 'cool_forest': return [['conifer', 0.45], ['araucaria', 0.2], ['broadleaf', 0.3], ['shrub', 0.05]];
    case 'wetland': return [['conifer', 0.45], ['palm', 0.2 + 0.1 * warm], ['treefern', 0.2], ['shrub', 0.15]];
    case 'fern_savanna': return [['shrub', 0.45], ['cycad', 0.25], ['conifer', 0.15], ['araucaria', 0.05], ['broadleaf', 0.1]];
    case 'arid_shrub': return [['shrub', 0.7], ['cycad', 0.3]];
    default: return [];
  }
}
