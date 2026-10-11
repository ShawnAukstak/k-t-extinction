/**
 * Low-poly animal bodies, built procedurally from a body plan and a few measurements (length, hip
 * height). These are stand-ins with correct overall proportions — not reconstructions (decision D10:
 * accurate models later). Every vertex carries the part it belongs to and that part's pivot, so the
 * vertex shader can swing legs, lower the head to graze and sway the tail.
 *
 * Local frame: +z forward (head), +y up, origin on the ground under the hips. Metres.
 */
import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, Matrix4, SphereGeometry, Vector3, CircleGeometry } from 'three';

export type BodyGroup =
  | 'ceratopsid' | 'hadrosaur' | 'tyrannosaurid' | 'small_theropod' | 'ornithomimid' | 'oviraptorosaur'
  | 'ankylosaur' | 'pachycephalosaur' | 'sauropod' | 'small_ornithischian' | 'crocodylian' | 'champsosaur'
  | 'turtle' | 'mammal_small' | 'bird' | 'pterosaur' | 'mosasaur' | 'plesiosaur' | 'frog' | 'lizard';

/** Part ids (attribute `part`): animation in the vertex shader keys off these. */
export const PART = { body: 0, head: 1, tail: 2, legFL: 3, legFR: 4, legHL: 5, legHR: 6, wingL: 7, wingR: 8 } as const;

interface Piece { g: BufferGeometry; part: number; pivot: Vector3; tint: number }

function piece(g: BufferGeometry, part: number, pivot: Vector3, m: Matrix4, tint = 0): Piece {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.applyMatrix4(m);
  ng.deleteAttribute('uv');
  return { g: ng, part, pivot, tint };
}

function merge(pieces: Piece[]): BufferGeometry {
  let count = 0;
  for (const p of pieces) count += p.g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  const part = new Float32Array(count), piv = new Float32Array(count * 3), tint = new Float32Array(count);
  let o = 0;
  for (const p of pieces) {
    const n = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array as Float32Array, o * 3);
    nor.set(p.g.attributes.normal.array as Float32Array, o * 3);
    part.fill(p.part, o, o + n);
    tint.fill(p.tint, o, o + n);
    for (let i = 0; i < n; i++) piv.set([p.pivot.x, p.pivot.y, p.pivot.z], (o + i) * 3);
    o += n;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('part', new BufferAttribute(part, 1));
  g.setAttribute('pivot', new BufferAttribute(piv, 3));
  g.setAttribute('tint', new BufferAttribute(tint, 1));
  g.computeBoundingSphere();
  return g;
}

const M = () => new Matrix4();
const T = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
const S = (x: number, y: number, z: number) => M().makeScale(x, y, z);
const RX = (a: number) => M().makeRotationX(a);

/** Sphere tessellation: big animals get rounder bodies; small ones are a few pixels tall anyway. */
let DETAIL = 10;

/** An ellipsoid centred at (x,y,z) with radii (rx, ry, rz). */
function ellipsoid(rx: number, ry: number, rz: number, x: number, y: number, z: number, detail = DETAIL): { g: BufferGeometry; m: Matrix4 } {
  return { g: new SphereGeometry(1, detail, Math.max(5, detail - 3)), m: T(x, y, z).multiply(S(rx, ry, rz)) };
}

/** A tapered tube along +z from z0 to z1 at height y (cone-ish, for necks and tails). */
function tube(r0: number, r1: number, y0: number, z0: number, y1: number, z1: number): { g: BufferGeometry; m: Matrix4 } {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const ang = Math.atan2(y1 - y0, z1 - z0);
  const g = new CylinderGeometry(r1, r0, len, 7, 1);
  // Cylinder is along +y: rotate to +z, then pitch by ang.
  const m = T(0, (y0 + y1) / 2, (z0 + z1) / 2).multiply(RX(-ang)).multiply(RX(Math.PI / 2));
  return { g, m };
}

function leg(x: number, hip: number, z: number, r: number, lean = 0): { g: BufferGeometry; m: Matrix4 } {
  const g = new CylinderGeometry(r * 0.75, r, hip, 6, 1);
  return { g, m: T(x, hip / 2, z).multiply(RX(lean)) };
}

export interface BodySpec {
  group: BodyGroup;
  lengthM: number;
  hipHeightM: number;
}

/** Build the body for a group at a given size. */
export function bodyGeometry(spec: BodySpec): BufferGeometry {
  const L = spec.lengthM;
  const H = spec.hipHeightM;
  DETAIL = L >= 6 ? 9 : L >= 2 ? 7 : 6;
  const p: Piece[] = [];
  const add = (x: { g: BufferGeometry; m: Matrix4 }, part: number, pivot: Vector3, tint = 0) => p.push(piece(x.g, part, pivot, x.m, tint));
  switch (spec.group) {
    case 'ceratopsid': {
      // Quadruped: barrel body, big head with frill and horns, short tail.
      const bodyLen = L * 0.45, bodyH = H * 0.75;
      add(ellipsoid(H * 0.42, bodyH * 0.55, bodyLen * 0.5, 0, H * 0.95, L * 0.05), PART.body, new Vector3());
      const neckZ = L * 0.3, headY = H * 0.75;
      add(ellipsoid(H * 0.28, H * 0.3, L * 0.13, 0, headY, neckZ + L * 0.1), PART.head, new Vector3(0, headY, neckZ));
      add({ g: new CircleGeometry(H * 0.55, 10), m: T(0, headY + H * 0.2, neckZ + L * 0.02).multiply(RX(-0.35)) }, PART.head, new Vector3(0, headY, neckZ), 1);
      add({ g: new ConeGeometry(H * 0.05, H * 0.45, 5), m: T(H * 0.12, headY + H * 0.3, neckZ + L * 0.14).multiply(RX(0.9)) }, PART.head, new Vector3(0, headY, neckZ), 1);
      add({ g: new ConeGeometry(H * 0.05, H * 0.45, 5), m: T(-H * 0.12, headY + H * 0.3, neckZ + L * 0.14).multiply(RX(0.9)) }, PART.head, new Vector3(0, headY, neckZ), 1);
      add(tube(H * 0.18, H * 0.04, H * 0.9, -L * 0.15, H * 0.5, -L * 0.45), PART.tail, new Vector3(0, H * 0.9, -L * 0.15));
      const r = H * 0.13;
      add(leg(H * 0.3, H * 0.85, L * 0.2, r), PART.legFL, new Vector3(H * 0.3, H * 0.85, L * 0.2));
      add(leg(-H * 0.3, H * 0.85, L * 0.2, r), PART.legFR, new Vector3(-H * 0.3, H * 0.85, L * 0.2));
      add(leg(H * 0.3, H, -L * 0.08, r * 1.15), PART.legHL, new Vector3(H * 0.3, H, -L * 0.08));
      add(leg(-H * 0.3, H, -L * 0.08, r * 1.15), PART.legHR, new Vector3(-H * 0.3, H, -L * 0.08));
      break;
    }
    case 'hadrosaur':
    case 'small_ornithischian':
    case 'pachycephalosaur': {
      // Facultative biped: body pitched forward, long tail, forelimbs reaching the ground.
      const quad = spec.group === 'hadrosaur';
      add(ellipsoid(H * 0.3, H * 0.38, L * 0.22, 0, H * 1.05, L * 0.02), PART.body, new Vector3());
      const headY = quad ? H * 1.2 : H * 1.45, headZ = L * 0.36;
      add(tube(H * 0.15, H * 0.1, H * 1.2, L * 0.18, headY, headZ - L * 0.05), PART.head, new Vector3(0, H * 1.15, L * 0.18));
      const headLen = spec.group === 'pachycephalosaur' ? L * 0.07 : L * 0.1;
      add(ellipsoid(H * 0.11, H * 0.13, headLen, 0, headY, headZ), PART.head, new Vector3(0, H * 1.15, L * 0.18));
      if (spec.group === 'pachycephalosaur') add(ellipsoid(H * 0.12, H * 0.1, headLen * 0.8, 0, headY + H * 0.1, headZ - headLen * 0.2), PART.head, new Vector3(0, H * 1.15, L * 0.18), 1);
      add(tube(H * 0.2, H * 0.03, H * 1.1, -L * 0.12, H * 0.9, -L * 0.62), PART.tail, new Vector3(0, H * 1.1, -L * 0.12));
      const fl = quad ? H * 0.95 : H * 0.6;
      add(leg(H * 0.18, fl, L * 0.15, H * 0.06, quad ? 0 : 0.5), PART.legFL, new Vector3(H * 0.18, fl, L * 0.15));
      add(leg(-H * 0.18, fl, L * 0.15, H * 0.06, quad ? 0 : 0.5), PART.legFR, new Vector3(-H * 0.18, fl, L * 0.15));
      add(leg(H * 0.22, H, -L * 0.04, H * 0.11), PART.legHL, new Vector3(H * 0.22, H, -L * 0.04));
      add(leg(-H * 0.22, H, -L * 0.04, H * 0.11), PART.legHR, new Vector3(-H * 0.22, H, -L * 0.04));
      break;
    }
    case 'tyrannosaurid':
    case 'small_theropod':
    case 'ornithomimid':
    case 'oviraptorosaur': {
      // Biped: horizontal body balanced over the hips, tail as counterweight.
      const big = spec.group === 'tyrannosaurid';
      add(ellipsoid(H * 0.24, H * 0.3, L * 0.18, 0, H * 1.1, L * 0.06), PART.body, new Vector3());
      const neckTop = H * (big ? 1.3 : 1.55), headZ = L * (big ? 0.38 : 0.35);
      add(tube(H * 0.14, H * 0.1, H * 1.2, L * 0.18, neckTop, headZ - L * 0.06), PART.head, new Vector3(0, H * 1.2, L * 0.18));
      const headLen = big ? L * 0.12 : L * 0.06;
      add(ellipsoid(H * (big ? 0.16 : 0.07), H * (big ? 0.2 : 0.08), headLen, 0, neckTop, headZ), PART.head, new Vector3(0, H * 1.2, L * 0.18));
      add(tube(H * 0.18, H * 0.02, H * 1.1, -L * 0.1, H * 0.95, -L * 0.62), PART.tail, new Vector3(0, H * 1.1, -L * 0.1));
      // Little arms (part of the body; they don't walk).
      add(tube(H * 0.04, H * 0.02, H * 1.05, L * 0.16, H * 0.85, L * 0.22), PART.body, new Vector3());
      add(leg(H * 0.18, H, 0, H * 0.1), PART.legHL, new Vector3(H * 0.18, H, 0));
      add(leg(-H * 0.18, H, 0, H * 0.1), PART.legHR, new Vector3(-H * 0.18, H, 0));
      break;
    }
    case 'sauropod': {
      add(ellipsoid(H * 0.45, H * 0.45, L * 0.18, 0, H * 1.15, 0), PART.body, new Vector3());
      add(tube(H * 0.22, H * 0.08, H * 1.3, L * 0.12, H * 2.4, L * 0.42), PART.head, new Vector3(0, H * 1.3, L * 0.12));
      add(ellipsoid(H * 0.08, H * 0.08, L * 0.025, 0, H * 2.42, L * 0.45), PART.head, new Vector3(0, H * 1.3, L * 0.12));
      add(tube(H * 0.25, H * 0.02, H * 1.2, -L * 0.12, H * 0.6, -L * 0.55), PART.tail, new Vector3(0, H * 1.2, -L * 0.12));
      const r = H * 0.14;
      add(leg(H * 0.3, H * 1.05, L * 0.12, r), PART.legFL, new Vector3(H * 0.3, H * 1.05, L * 0.12));
      add(leg(-H * 0.3, H * 1.05, L * 0.12, r), PART.legFR, new Vector3(-H * 0.3, H * 1.05, L * 0.12));
      add(leg(H * 0.32, H, -L * 0.1, r), PART.legHL, new Vector3(H * 0.32, H, -L * 0.1));
      add(leg(-H * 0.32, H, -L * 0.1, r), PART.legHR, new Vector3(-H * 0.32, H, -L * 0.1));
      break;
    }
    case 'ankylosaur': {
      add(ellipsoid(H * 0.75, H * 0.5, L * 0.3, 0, H * 0.95, 0), PART.body, new Vector3());
      add(ellipsoid(H * 0.3, H * 0.22, L * 0.07, 0, H * 0.8, L * 0.34), PART.head, new Vector3(0, H * 0.85, L * 0.27));
      add(tube(H * 0.2, H * 0.06, H * 0.9, -L * 0.25, H * 0.7, -L * 0.6), PART.tail, new Vector3(0, H * 0.9, -L * 0.25));
      add(ellipsoid(H * 0.22, H * 0.15, L * 0.05, 0, H * 0.68, -L * 0.62), PART.tail, new Vector3(0, H * 0.9, -L * 0.25), 1);
      const r = H * 0.16;
      for (const [part, x, z] of [[PART.legFL, 0.45, 0.18], [PART.legFR, -0.45, 0.18], [PART.legHL, 0.48, -0.15], [PART.legHR, -0.48, -0.15]] as const) {
        add(leg(H * x, H * 0.8, L * z, r), part, new Vector3(H * x, H * 0.8, L * z));
      }
      break;
    }
    case 'pterosaur': {
      // Azhdarchid on the ground: walks on all fours, the folded wings forming long forelimbs, so the
      // shoulders stand higher than the hips; stiff neck and a huge, long-beaked head (Witton & Naish 2008).
      add({ g: new SphereGeometry(1, 10, 7), m: T(0, H * 1.25, 0).multiply(RX(-0.45)).multiply(S(H * 0.22, H * 0.26, L * 0.12)) }, PART.body, new Vector3());
      add(tube(H * 0.1, H * 0.06, H * 1.45, L * 0.1, H * 2.5, L * 0.32), PART.head, new Vector3(0, H * 1.45, L * 0.1));
      add(ellipsoid(H * 0.08, H * 0.13, L * 0.08, 0, H * 2.55, L * 0.36), PART.head, new Vector3(0, H * 1.45, L * 0.1));
      add({ g: new ConeGeometry(H * 0.07, L * 0.32, 4), m: T(0, H * 2.3, L * 0.5).multiply(RX(Math.PI / 2 + 0.75)) }, PART.head, new Vector3(0, H * 1.45, L * 0.1), 1);
      // Forelimbs (folded wings): long, with the furled membrane alongside.
      for (const [part, x] of [[PART.legFL, 1], [PART.legFR, -1]] as const) {
        add(leg(x * H * 0.24, H * 1.45, L * 0.1, H * 0.05, -0.15), part, new Vector3(x * H * 0.24, H * 1.45, L * 0.1));
        add(ellipsoid(H * 0.03, H * 0.55, L * 0.07, x * H * 0.3, H * 0.95, L * 0.06), part, new Vector3(x * H * 0.24, H * 1.45, L * 0.1), 1);
      }
      add(leg(H * 0.14, H, -L * 0.1, H * 0.05), PART.legHL, new Vector3(H * 0.14, H, -L * 0.1));
      add(leg(-H * 0.14, H, -L * 0.1, H * 0.05), PART.legHR, new Vector3(-H * 0.14, H, -L * 0.1));
      break;
    }
    case 'turtle': {
      // Domed shell on short legs; the head and tail just out of it.
      add(ellipsoid(L * 0.36, L * 0.17, L * 0.42, 0, H * 0.95, 0), PART.body, new Vector3());
      add(ellipsoid(L * 0.34, L * 0.04, L * 0.4, 0, H * 0.8, 0), PART.body, new Vector3(), 1);
      add(ellipsoid(L * 0.07, L * 0.06, L * 0.09, 0, H * 0.9, L * 0.46), PART.head, new Vector3(0, H * 0.9, L * 0.38));
      add(tube(L * 0.04, L * 0.01, H * 0.8, -L * 0.38, H * 0.6, -L * 0.52), PART.tail, new Vector3(0, H * 0.8, -L * 0.38));
      for (const [part, x, z] of [[PART.legFL, 0.26, 0.24], [PART.legFR, -0.26, 0.24], [PART.legHL, 0.26, -0.24], [PART.legHR, -0.26, -0.24]] as const) {
        add(leg(L * x, H * 0.9, L * z, L * 0.06), part, new Vector3(L * x, H * 0.9, L * z));
      }
      break;
    }
    case 'mammal_small': {
      // Small quadruped (opossum- to badger-like): long body, pointed head, tail.
      add(ellipsoid(H * 0.6, H * 0.65, L * 0.32, 0, H * 1.15, 0), PART.body, new Vector3());
      add(ellipsoid(H * 0.38, H * 0.36, L * 0.14, 0, H * 1.25, L * 0.4), PART.head, new Vector3(0, H * 1.15, L * 0.28));
      add(tube(H * 0.15, H * 0.04, H * 1.05, -L * 0.3, H * 0.5, -L * 0.8), PART.tail, new Vector3(0, H * 1.05, -L * 0.3));
      for (const [part, x, z] of [[PART.legFL, 0.35, 0.2], [PART.legFR, -0.35, 0.2], [PART.legHL, 0.38, -0.2], [PART.legHR, -0.38, -0.2]] as const) {
        add(leg(H * x, H, L * z, H * 0.14), part, new Vector3(H * x, H, L * z));
      }
      break;
    }
    case 'bird': {
      // Ground bird: round body, folded wings, short tail, beak.
      add(ellipsoid(H * 0.45, H * 0.5, L * 0.3, 0, H * 1.35, 0), PART.body, new Vector3());
      add(ellipsoid(H * 0.24, H * 0.24, H * 0.27, 0, H * 1.85, L * 0.3), PART.head, new Vector3(0, H * 1.5, L * 0.2));
      add({ g: new ConeGeometry(H * 0.07, L * 0.14, 4), m: T(0, H * 1.83, L * 0.3 + H * 0.25 + L * 0.06).multiply(RX(Math.PI / 2)) }, PART.head, new Vector3(0, H * 1.5, L * 0.2), 1);
      add(ellipsoid(H * 0.08, H * 0.33, L * 0.28, H * 0.44, H * 1.42, -L * 0.03), PART.wingL, new Vector3(H * 0.4, H * 1.5, 0), 1);
      add(ellipsoid(H * 0.08, H * 0.33, L * 0.28, -H * 0.44, H * 1.42, -L * 0.03), PART.wingR, new Vector3(-H * 0.4, H * 1.5, 0), 1);
      add(ellipsoid(H * 0.22, H * 0.06, L * 0.16, 0, H * 1.4, -L * 0.38), PART.tail, new Vector3(0, H * 1.4, -L * 0.25));
      add(leg(H * 0.18, H, 0, H * 0.06), PART.legHL, new Vector3(H * 0.18, H, 0));
      add(leg(-H * 0.18, H, 0, H * 0.06), PART.legHR, new Vector3(-H * 0.18, H, 0));
      break;
    }
    case 'frog': {
      // Squat, wide-mouthed frog (Beelzebufo-like): hind legs folded at the sides.
      add(ellipsoid(L * 0.32, L * 0.2, L * 0.38, 0, L * 0.22, 0), PART.body, new Vector3());
      add(ellipsoid(L * 0.3, L * 0.15, L * 0.2, 0, L * 0.25, L * 0.3), PART.head, new Vector3(0, L * 0.22, L * 0.2));
      add(ellipsoid(L * 0.1, L * 0.08, L * 0.24, L * 0.3, L * 0.1, -L * 0.15), PART.legHL, new Vector3(L * 0.3, L * 0.15, -L * 0.05));
      add(ellipsoid(L * 0.1, L * 0.08, L * 0.24, -L * 0.3, L * 0.1, -L * 0.15), PART.legHR, new Vector3(-L * 0.3, L * 0.15, -L * 0.05));
      add(leg(L * 0.22, L * 0.16, L * 0.2, L * 0.04), PART.legFL, new Vector3(L * 0.22, L * 0.16, L * 0.2));
      add(leg(-L * 0.22, L * 0.16, L * 0.2, L * 0.04), PART.legFR, new Vector3(-L * 0.22, L * 0.16, L * 0.2));
      break;
    }
    case 'mosasaur': {
      // Swimmer, origin at the waterline: long streamlined body, four flippers, a downturned tail
      // with a fluke (Lindgren et al. 2013). Rides just under the surface, back and head showing.
      const r = L * 0.065;
      add(ellipsoid(r, r * 1.1, L * 0.24, 0, 0, L * 0.04), PART.body, new Vector3());
      add(ellipsoid(r * 0.7, r * 0.6, L * 0.1, 0, r * 0.15, L * 0.34), PART.head, new Vector3(0, 0, L * 0.25));
      add(tube(r * 0.85, r * 0.2, 0, -L * 0.17, -r * 0.4, -L * 0.48), PART.tail, new Vector3(0, 0, -L * 0.17));
      add({ g: new ConeGeometry(r * 0.25, L * 0.12, 4), m: T(0, -r * 0.9, -L * 0.5).multiply(RX(0.5)).multiply(S(0.4, 1, 1)) }, PART.tail, new Vector3(0, 0, -L * 0.17), 1);
      for (const [part, x, z, k] of [[PART.legFL, 1, 0.16, 1], [PART.legFR, -1, 0.16, 1], [PART.legHL, 1, -0.1, 0.75], [PART.legHR, -1, -0.1, 0.75]] as const) {
        add(ellipsoid(L * 0.06 * k, r * 0.12, L * 0.028 * k, x * (r + L * 0.045 * k), -r * 0.45, L * z), part, new Vector3(x * r, -r * 0.45, L * z), 1);
      }
      break;
    }
    case 'plesiosaur': {
      // Elasmosaurid: barrel body under the surface, very long neck raised, four large flippers.
      const r = L * 0.085;
      add(ellipsoid(r * 1.15, r * 0.8, L * 0.15, 0, -r * 0.35, 0), PART.body, new Vector3());
      add(tube(r * 0.45, r * 0.18, 0, L * 0.12, r * 1.4, L * 0.48), PART.head, new Vector3(0, 0, L * 0.12));
      add(ellipsoid(r * 0.24, r * 0.2, L * 0.035, 0, r * 1.45, L * 0.51), PART.head, new Vector3(0, 0, L * 0.12));
      add(tube(r * 0.55, r * 0.08, -r * 0.3, -L * 0.12, -r * 0.4, -L * 0.32), PART.tail, new Vector3(0, -r * 0.3, -L * 0.12));
      for (const [part, x, z] of [[PART.legFL, 1, 0.07], [PART.legFR, -1, 0.07], [PART.legHL, 1, -0.08], [PART.legHR, -1, -0.08]] as const) {
        add(ellipsoid(L * 0.085, r * 0.1, L * 0.035, x * (r + L * 0.07), -r * 0.55, L * z), part, new Vector3(x * r, -r * 0.55, L * z), 1);
      }
      break;
    }
    case 'crocodylian':
    case 'champsosaur':
    case 'lizard':
    default: {
      // Sprawling: long low body and tail, legs out to the sides.
      add(ellipsoid(H * 0.6, H * 0.4, L * 0.22, 0, H * 0.55, 0), PART.body, new Vector3());
      add(ellipsoid(H * 0.3, H * 0.22, L * 0.12, 0, H * 0.5, L * 0.32), PART.head, new Vector3(0, H * 0.5, L * 0.2));
      add(tube(H * 0.35, H * 0.03, H * 0.5, -L * 0.15, H * 0.35, -L * 0.6), PART.tail, new Vector3(0, H * 0.5, -L * 0.15));
      for (const [part, x, z] of [[PART.legFL, 0.7, 0.14], [PART.legFR, -0.7, 0.14], [PART.legHL, 0.75, -0.14], [PART.legHR, -0.75, -0.14]] as const) {
        add(leg(H * x, H * 0.5, L * z, H * 0.12), part, new Vector3(H * x, H * 0.5, L * z));
      }
      break;
    }
  }
  return merge(p);
}
