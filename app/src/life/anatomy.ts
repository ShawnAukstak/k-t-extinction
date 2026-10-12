/**
 * A small kit for building animal bodies procedurally: lofted tubes (a smooth skin swept along a
 * spine or a limb), ellipsoids and cones, merged into one indexed geometry. Every vertex carries what
 * the vertex shader needs to pose it:
 *   part    which chain it belongs to (PART)
 *   pivot   that chain's root (neck base, tail base, hip, shoulder)
 *   aChain  x: position along the chain (0 at the root … 1 at the tip; limbs have the knee/elbow at
 *           0.5), yzw: the limb's middle joint (knee or elbow)
 *   tint    surface (MAT): skin, keratin (horns, beaks, claws), feathers, membrane, eye
 * Local frame: +z forward, +y up, origin on the ground under the hips. Metres.
 */
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PART = { body: 0, head: 1, tail: 2, legFL: 3, legFR: 4, legHL: 5, legHR: 6, wingL: 7, wingR: 8 } as const;
export const MAT = { skin: 0, keratin: 1, feather: 2, membrane: 3, eye: 4, belly: 5 } as const;

export interface Meta {
  part: number;
  pivot: Vector3;
  /** Position along the chain (0 root … 1 tip). */
  s: number;
  joint?: Vector3;
  mat: number;
}

/** A cross-section: centre, half-width (sideways), half-height (in the plane of the curve). */
export interface Section { c: Vector3; w: number; h: number; meta: Meta; belly?: number }

const ZERO = new Vector3();

/** Frame for a ring: sideways S and "up" U, both perpendicular to the tangent T. */
function frame(t: Vector3): { s: Vector3; u: Vector3 } {
  const ref = Math.abs(t.x) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(t, ref).normalize();
  const s = new Vector3().crossVectors(u, t).normalize();
  // Keep "up" pointing up (or forward, for vertical tubes) so cross-sections don't flip.
  if (u.y < -1e-3 || (Math.abs(u.y) <= 1e-3 && u.z < 0)) { u.negate(); s.negate(); }
  return { s, u };
}

function geometryFrom(pos: number[], idx: number[], metas: Meta[]): BufferGeometry {
  const n = pos.length / 3;
  const part = new Float32Array(n), piv = new Float32Array(n * 3), chain = new Float32Array(n * 4), tint = new Float32Array(n);
  metas.forEach((m, i) => {
    part[i] = m.part; tint[i] = m.mat;
    piv[i * 3] = m.pivot.x; piv[i * 3 + 1] = m.pivot.y; piv[i * 3 + 2] = m.pivot.z;
    const j = m.joint ?? ZERO;
    chain[i * 4] = m.s; chain[i * 4 + 1] = j.x; chain[i * 4 + 2] = j.y; chain[i * 4 + 3] = j.z;
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('part', new BufferAttribute(part, 1));
  g.setAttribute('pivot', new BufferAttribute(piv, 3));
  g.setAttribute('aChain', new BufferAttribute(chain, 4));
  g.setAttribute('tint', new BufferAttribute(tint, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Sweep a closed cross-section along a list of sections. `sides` vertices per ring, wrapped (no seam).
 * The ends close to a point if their sections are tiny; otherwise they are capped.
 */
export function loft(sections: Section[], sides: number, capEnds = true): BufferGeometry {
  const pos: number[] = [], idx: number[] = [], metas: Meta[] = [];
  const n = sections.length;
  for (let i = 0; i < n; i++) {
    const a = sections[Math.max(0, i - 1)].c, b = sections[Math.min(n - 1, i + 1)].c;
    const t = new Vector3().subVectors(b, a).normalize();
    const { s, u } = frame(t);
    const sec = sections[i];
    for (let j = 0; j < sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const k = sn < 0 ? (sec.belly ?? 1) : 1;
      const p = sec.c.clone().addScaledVector(s, sec.w * cs).addScaledVector(u, sec.h * sn * k);
      pos.push(p.x, p.y, p.z);
      metas.push(sec.meta);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides), c = (i + 1) * sides + j, d = (i + 1) * sides + ((j + 1) % sides);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capEnds) {
    for (const [ri, flip] of [[0, true], [n - 1, false]] as const) {
      const sec = sections[ri];
      const ci = pos.length / 3;
      pos.push(sec.c.x, sec.c.y, sec.c.z);
      metas.push(sec.meta);
      for (let j = 0; j < sides; j++) {
        const a = ri * sides + j, b = ri * sides + ((j + 1) % sides);
        if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
      }
    }
  }
  const g = geometryFrom(pos, idx, metas);
  orientOutward(g, sections);
  return g;
}

/** Flip the winding if the normals came out pointing inward. */
function orientOutward(g: BufferGeometry, sections: Section[]): void {
  const p = g.attributes.position as BufferAttribute, nrm = g.attributes.normal as BufferAttribute;
  const sides = Math.round((p.count - 2) / sections.length) || 1;
  // A ring near the middle (the widest part is a safe test).
  let best = 0, bi = 0;
  sections.forEach((s, i) => { if (s.w * s.h > best) { best = s.w * s.h; bi = i; } });
  let score = 0;
  for (let j = 0; j < sides; j++) {
    const v = bi * sides + j;
    const out = new Vector3().fromBufferAttribute(p, v).sub(sections[bi].c);
    score += out.dot(new Vector3().fromBufferAttribute(nrm, v));
  }
  if (score >= 0) return;
  const index = g.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  g.computeVertexNormals();
}

/** Catmull-Rom point on a polyline (uniform), t in [0, n-1]. */
function catmull(pts: Vector3[], t: number, out = new Vector3()): Vector3 {
  const n = pts.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(t)));
  const f = t - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  const f2 = f * f, f3 = f2 * f;
  return out.set(0, 0, 0)
    .addScaledVector(p0, -0.5 * f3 + f2 - 0.5 * f)
    .addScaledVector(p1, 1.5 * f3 - 2.5 * f2 + 1)
    .addScaledVector(p2, -1.5 * f3 + 2 * f2 + 0.5 * f)
    .addScaledVector(p3, 0.5 * f3 - 0.5 * f2);
}

/** A node of a spine: position (z forward, y up; x = 0), half-width, half-height. */
export interface SpineNode { z: number; y: number; w: number; h: number; mat?: number }

export interface Spine {
  nodes: SpineNode[];           // tail tip first, snout tip last
  /** Node indices where the tail ends (tail base) and the neck begins. */
  tailBase: number;
  neckBase: number;
  /** Flattening of the lower half of each section (bellies are flatter than backs). */
  belly?: number;
}

/** Evaluate a spine at parameter u ∈ [0, nodes-1]: centre, half-width, half-height. */
export function spineAt(sp: Spine, u: number): { c: Vector3; w: number; h: number } {
  const pts = sp.nodes.map((n) => new Vector3(0, n.y, n.z));
  const ws = sp.nodes.map((n) => new Vector3(n.w, n.h, 0));
  const c = catmull(pts, u);
  const wh = catmull(ws, u);
  return { c, w: Math.max(1e-4, wh.x), h: Math.max(1e-4, wh.y) };
}

/** The head-to-tail body skin, with tail, body and neck/head chains. */
export function spineLoft(sp: Spine, rings: number, sides: number): BufferGeometry {
  const n = sp.nodes.length;
  const tailPivot = spineAt(sp, sp.tailBase).c;
  const neckPivot = spineAt(sp, sp.neckBase).c;
  const sections: Section[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = (i / rings) * (n - 1);
    const { c, w, h } = spineAt(sp, u);
    const node = sp.nodes[Math.min(n - 1, Math.round(u))];
    let meta: Meta;
    if (u < sp.tailBase) meta = { part: PART.tail, pivot: tailPivot, s: (sp.tailBase - u) / sp.tailBase, mat: node.mat ?? MAT.skin };
    else if (u > sp.neckBase) meta = { part: PART.head, pivot: neckPivot, s: (u - sp.neckBase) / (n - 1 - sp.neckBase), mat: node.mat ?? MAT.skin };
    else meta = { part: PART.body, pivot: ZERO, s: 0, mat: node.mat ?? MAT.skin };
    sections.push({ c, w, h, meta, belly: sp.belly });
  }
  return loft(sections, sides);
}

/** Where a point on the body surface is: spine parameter u, angle around (0 = side, π/2 = top). */
export function spineSurface(sp: Spine, u: number, angle: number, side: 1 | -1 = 1): { p: Vector3; n: Vector3 } {
  const { c, w, h } = spineAt(sp, u);
  const a = spineAt(sp, Math.max(0, u - 0.05)).c, b = spineAt(sp, Math.min(sp.nodes.length - 1, u + 0.05)).c;
  const t = b.sub(a).normalize();
  const { s, u: up } = frame(t);
  const p = c.clone().addScaledVector(s, side * w * Math.cos(angle)).addScaledVector(up, h * Math.sin(angle));
  const n = new Vector3().addScaledVector(s, side * Math.cos(angle) / w).addScaledVector(up, Math.sin(angle) / h).normalize();
  return { p, n };
}

/**
 * A limb: root (hip/shoulder) → middle joint (knee/elbow) → … → tip, with radii at each point.
 * The middle joint sits at s = 0.5 so the shader can bend there.
 */
export function limb(points: Vector3[], radii: number[], part: number, rings: number, sides: number, mat: number = MAT.skin, depth = 1): BufferGeometry {
  const root = points[0], knee = points[1];
  // Cumulative lengths, to place rings along each segment.
  const segLen: number[] = [];
  for (let i = 0; i < points.length - 1; i++) segLen.push(points[i].distanceTo(points[i + 1]));
  const total = segLen.reduce((a, b) => a + b, 0);
  const sections: Section[] = [];
  for (let k = 0; k <= rings; k++) {
    let d = (k / rings) * total, i = 0;
    while (i < segLen.length - 1 && d > segLen[i]) { d -= segLen[i]; i++; }
    const f = Math.min(1, d / segLen[i]);
    const c = points[i].clone().lerp(points[i + 1], f);
    const r = radii[i] + (radii[i + 1] - radii[i]) * f;
    // s: 0 → 0.5 along the first segment, 0.5 → 1 along the rest.
    const along = segLen.slice(0, i).reduce((a, b) => a + b, 0) + d;
    const s = along <= segLen[0] ? 0.5 * (along / segLen[0]) : 0.5 + 0.5 * ((along - segLen[0]) / Math.max(1e-6, total - segLen[0]));
    sections.push({ c, w: r, h: r * depth, meta: { part, pivot: root, s, joint: knee, mat } });
  }
  return loft(sections, sides);
}

/** An ellipsoid at c with radii (rx, ry, rz), optionally rotated about x by `pitch`. */
export function ellipsoid(c: Vector3, rx: number, ry: number, rz: number, meta: Meta, rings: number, sides: number, pitch = 0, yaw = 0): BufferGeometry {
  const sections: Section[] = [];
  const axis = new Vector3(0, -Math.sin(pitch), Math.cos(pitch)).applyAxisAngle(new Vector3(0, 1, 0), yaw);
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * Math.PI;
    const k = Math.cos(a);
    // Slightly blunt the poles so the end rings aren't degenerate.
    sections.push({ c: c.clone().addScaledVector(axis, Math.sin(a) * rz), w: Math.max(rx * k, rx * 0.02), h: Math.max(ry * k, ry * 0.02), meta });
  }
  return loft(sections, sides);
}

/** A tapering horn or spike along a curved path from base to tip. */
export function horn(points: Vector3[], baseR: number, meta: Meta, rings: number, sides: number): BufferGeometry {
  const sections: Section[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = (i / rings) * (points.length - 1);
    const c = catmull(points, t);
    const r = baseR * (1 - i / rings) ** 0.9 + 1e-4;
    sections.push({ c, w: r, h: r, meta });
  }
  return loft(sections, sides);
}

/** Merge parts into one geometry (all parts carry the same attributes). */
export function assemble(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('anatomy: could not merge parts');
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}
