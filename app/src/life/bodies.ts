/**
 * Animal bodies, built procedurally from a body plan and two measurements (length L, hip height H):
 * one continuous skin lofted along a curved spine from tail tip to snout, jointed limbs, and the
 * features that identify each group (frills and horns, armour, crests, beaks, feathers). These are
 * simplified reconstructions with the right proportions and integument for current evidence — not
 * sculpted models (decision D10). Proportions follow skeletal reconstructions (e.g. Hutchinson et al.
 * 2011 for Tyrannosaurus; Scotese-era reference skeletals for the rest), expressed as fractions of L
 * (along the body) and H (heights and widths), so one plan fits a group's members at their own sizes.
 *
 * Two levels of detail: 'hi' (a few thousand triangles: eyes, toes, osteoderms) for animals near the
 * camera and 'lo' (a few hundred) for the rest.
 *
 * Local frame: +z forward (head), +y up, +x the animal's left, origin on the ground under the hips.
 */
import { BufferGeometry, Vector3 } from 'three';
import { assemble, ellipsoid, horn, limb, MAT, PART, spineAt, spineLoft, spineSurface, type Meta, type Spine, type SpineNode } from './anatomy';

export { PART } from './anatomy';

export type BodyGroup =
  | 'ceratopsid' | 'hadrosaur' | 'tyrannosaurid' | 'small_theropod' | 'ornithomimid' | 'oviraptorosaur'
  | 'ankylosaur' | 'pachycephalosaur' | 'sauropod' | 'small_ornithischian' | 'crocodylian' | 'champsosaur'
  | 'turtle' | 'mammal_small' | 'bird' | 'pterosaur' | 'mosasaur' | 'plesiosaur' | 'frog' | 'lizard';

export type Lod = 'hi' | 'lo';

export interface BodySpec {
  group: BodyGroup;
  lengthM: number;
  hipHeightM: number;
  /** Species id, for features particular to one animal (Carnotaurus' horns, Olorotitan's crest…). */
  variant?: string;
}

/** Groups shown with feathers (oviraptorosaurs, ornithomimids and dromaeosaurs: Turner et al. 2007; Zelenitsky et al. 2012). */
export const FEATHERED = new Set<BodyGroup>(['small_theropod', 'ornithomimid', 'oviraptorosaur', 'bird']);

interface Res { spineRings: number; spineSides: number; limbRings: number; limbSides: number; ellRings: number; ellSides: number; hornRings: number; hornSides: number; detail: boolean }
const RES: Record<Lod, Res> = {
  hi: { spineRings: 60, spineSides: 16, limbRings: 9, limbSides: 9, ellRings: 8, ellSides: 10, hornRings: 6, hornSides: 6, detail: true },
  lo: { spineRings: 18, spineSides: 7, limbRings: 3, limbSides: 5, ellRings: 4, ellSides: 6, hornRings: 2, hornSides: 4, detail: false },
};

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
type N = [number, number, number, number, number?];

class Body {
  readonly parts: BufferGeometry[] = [];
  spine!: Spine;
  constructor(readonly L: number, readonly H: number, readonly r: Res) {}

  /** Spine from nodes given as [z/L, y/H, w/H, h/H, mat?]. */
  setSpine(nodes: N[], tailBase: number, neckBase: number, belly = 0.88, scaleWH = this.H): void {
    const ns: SpineNode[] = nodes.map(([z, y, w, h, mat]) => ({ z: z * this.L, y: y * this.H, w: w * scaleWH, h: h * scaleWH, mat }));
    this.spine = { nodes: ns, tailBase, neckBase, belly };
    this.parts.push(spineLoft(this.spine, this.r.spineRings, this.r.spineSides));
  }

  /** Meta for something fixed to the spine at parameter u (rides along with the neck or tail). */
  metaAt(u: number, mat: number): Meta {
    const sp = this.spine, n = sp.nodes.length;
    if (u > sp.neckBase) return { part: PART.head, pivot: spineAt(sp, sp.neckBase).c, s: (u - sp.neckBase) / (n - 1 - sp.neckBase), mat };
    if (u < sp.tailBase) return { part: PART.tail, pivot: spineAt(sp, sp.tailBase).c, s: (sp.tailBase - u) / sp.tailBase, mat };
    return { part: PART.body, pivot: V(0, 0, 0), s: 0, mat };
  }

  /** A pair of limbs from points given as [x/H, y/H, z/L] (left side; mirrored for the right). */
  limbs(left: number, right: number, pts: [number, number, number][], radii: number[], mat: number = MAT.skin, depth = 1): void {
    for (const [part, sx] of [[left, 1], [right, -1]] as const) {
      const p = pts.map(([x, y, z]) => V(sx * x * this.H, y * this.H, z * this.L));
      this.parts.push(limb(p, radii.map((k) => k * this.H), part, this.r.limbRings, this.r.limbSides, mat, depth));
    }
  }

  /** Toes (or claws) fanning forward from a foot point, both sides. */
  toes(left: number, right: number, foot: [number, number, number], n: number, len: number, r: number, spread = 0.35, mat: number = MAT.skin): void {
    if (!this.r.detail) return;
    for (const [part, sx] of [[left, 1], [right, -1]] as const) {
      const base = V(sx * foot[0] * this.H, foot[1] * this.H, foot[2] * this.L);
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2;
        const dir = V(Math.sin(a) * sx, 0, Math.cos(a));
        const tip = base.clone().addScaledVector(dir, len * this.L).setY(r * this.H * 0.4);
        const mid = base.clone().lerp(tip, 0.5).setY(r * this.H * 0.8);
        // Toes ride with the foot: s = 1 (below the knee).
        this.parts.push(horn([base.clone().setY(r * this.H), mid, tip], r * this.H, { part, pivot: V(0, 0, 0), s: 1, mat }, this.r.hornRings, this.r.hornSides));
      }
    }
    // Pivot and joint are filled by fixToes below (they must match the leg's).
  }

  ellipsoid(c: Vector3, rx: number, ry: number, rz: number, meta: Meta, pitch = 0, yaw = 0): void {
    this.parts.push(ellipsoid(c, rx, ry, rz, meta, this.r.ellRings, this.r.ellSides, pitch, yaw));
  }

  horn(pts: Vector3[], r: number, meta: Meta): void {
    this.parts.push(horn(pts, r, meta, this.r.hornRings, this.r.hornSides));
  }

  /** Eyes on both sides of the head at spine parameter u, angle up from the side. */
  eyes(u: number, angle = 0.45, size = 0.02): void {
    if (!this.r.detail) return;
    for (const side of [1, -1] as const) {
      const { p, n } = spineSurface(this.spine, u, angle, side);
      const r = size * this.H;
      this.ellipsoid(p.addScaledVector(n, -r * 0.35), r, r, r, this.metaAt(u, MAT.eye));
    }
  }

  build(): BufferGeometry {
    const g = assemble(this.parts);
    fixToes(g);
    return g;
  }
}

/**
 * Toes are built before we know their leg's pivot/knee: copy them from the nearest vertex of the same
 * part that has a joint (the leg itself), so toes swing and flex with the foot.
 */
function fixToes(g: BufferGeometry): void {
  const part = g.attributes.part.array as Float32Array;
  const piv = g.attributes.pivot.array as Float32Array;
  const ch = g.attributes.aChain.array as Float32Array;
  const legs = new Map<number, { piv: number[]; joint: number[] }>();
  for (let i = 0; i < part.length; i++) {
    const p = part[i];
    if (p < 3 || p > 6 || legs.has(p)) continue;
    if (ch[i * 4 + 1] !== 0 || ch[i * 4 + 2] !== 0 || ch[i * 4 + 3] !== 0) {
      legs.set(p, { piv: [piv[i * 3], piv[i * 3 + 1], piv[i * 3 + 2]], joint: [ch[i * 4 + 1], ch[i * 4 + 2], ch[i * 4 + 3]] });
    }
  }
  for (let i = 0; i < part.length; i++) {
    const leg = legs.get(part[i]);
    if (!leg || (ch[i * 4 + 1] !== 0 || ch[i * 4 + 2] !== 0 || ch[i * 4 + 3] !== 0)) continue;
    piv.set(leg.piv, i * 3);
    ch.set([1, ...leg.joint], i * 4);
  }
}

// ── body plans ──────────────────────────────────────────────────────────────────────────────────

function theropod(b: Body, variant: string | undefined, kind: 'tyrannosaurid' | 'small_theropod' | 'ornithomimid' | 'oviraptorosaur'): void {
  const F = FEATHERED.has(kind) ? MAT.feather : MAT.skin;
  const K = MAT.keratin;
  if (kind === 'tyrannosaurid') {
    const abeli = variant === 'carnotaurus' || variant === 'majungasaurus';
    // Tyrannosaurus after Hutchinson et al. 2011; abelisaurids have short, deep skulls.
    // A short, thick S-curved neck and a skull an eighth of the body length.
    const head: N[] = abeli
      ? [[0.25, 1.22, 0.12, 0.17], [0.275, 1.22, 0.13, 0.18], [0.3, 1.18, 0.11, 0.16], [0.322, 1.12, 0.08, 0.12], [0.336, 1.08, 0.045, 0.07], [0.341, 1.07, 0.01, 0.012]]
      : [[0.26, 1.22, 0.12, 0.165], [0.29, 1.22, 0.135, 0.175], [0.32, 1.17, 0.11, 0.155], [0.345, 1.11, 0.08, 0.12], [0.362, 1.07, 0.045, 0.075], [0.368, 1.06, 0.012, 0.015]];
    b.setSpine([
      [-0.64, 0.66, 0.012, 0.012], [-0.52, 0.8, 0.04, 0.06], [-0.38, 0.92, 0.075, 0.11], [-0.24, 1.02, 0.12, 0.17],
      [-0.11, 1.08, 0.16, 0.23], [0.0, 1.08, 0.2, 0.28], [0.08, 1.02, 0.23, 0.34], [0.15, 1.0, 0.21, 0.32],
      [0.2, 1.06, 0.16, 0.24], [0.232, 1.15, 0.13, 0.19], ...head,
    ], 4, 8);
    const n = b.spine.nodes.length;
    b.eyes(n - 5 + 0.3, 0.55, 0.022);
    if (variant === 'carnotaurus') {
      for (const sx of [1, -1]) {
        const { p } = spineSurface(b.spine, n - 5.6, 1.1, sx as 1 | -1);
        b.horn([p, p.clone().add(V(sx * 0.06 * b.H, 0.05 * b.H, -0.005 * b.L)), p.clone().add(V(sx * 0.1 * b.H, 0.12 * b.H, -0.01 * b.L))], 0.035 * b.H, b.metaAt(n - 5.6, K));
      }
    }
    if (variant === 'majungasaurus') {
      const { p } = spineSurface(b.spine, n - 5.5, Math.PI / 2);
      b.ellipsoid(p, 0.035 * b.H, 0.03 * b.H, 0.02 * b.L, b.metaAt(n - 5.5, K));
    }
    b.limbs(PART.legHL, PART.legHR, [[0.17, 1, 0], [0.21, 0.56, 0.055], [0.19, 0.24, -0.03], [0.18, 0.035, 0.012]], [0.19, 0.1, 0.06, 0.05]);
    b.toes(PART.legHL, PART.legHR, [0.18, 0, 0.012], 3, 0.045, 0.035, 0.3, MAT.skin);
    // The famous small arms (two fingers); abelisaurids' were even smaller. They don't walk.
    const arm = abeli ? 0.6 : 1;
    b.limbs(PART.body, PART.body, [[0.13, 0.98, 0.17], [0.15, 0.98 - 0.12 * arm, 0.17 + 0.015 * arm], [0.12, 0.98 - 0.1 * arm, 0.17 + 0.045 * arm]], [0.035 * arm, 0.025 * arm, 0.012 * arm]);
    return;
  }
  if (kind === 'small_theropod') {
    // Dromaeosaurid (Velociraptor proportions): long low skull, stiff tail, feathered, winged arms.
    b.setSpine([
      [-0.62, 1.0, 0.01, 0.01, F], [-0.48, 1.04, 0.025, 0.03, F], [-0.33, 1.07, 0.04, 0.05, F], [-0.18, 1.1, 0.065, 0.085, F],
      [-0.07, 1.12, 0.1, 0.13, F], [0.03, 1.14, 0.13, 0.17, F], [0.11, 1.12, 0.14, 0.19, F], [0.18, 1.18, 0.1, 0.13, F],
      [0.23, 1.38, 0.065, 0.08, F], [0.27, 1.55, 0.06, 0.075, F], [0.3, 1.6, 0.075, 0.1], [0.34, 1.57, 0.06, 0.08],
      [0.375, 1.53, 0.035, 0.045], [0.39, 1.52, 0.006, 0.006],
    ], 4, 7);
    b.eyes(10.6, 0.55, 0.03);
    // Tail feather fan along the last third of the tail.
    b.ellipsoid(V(0, 1.03 * b.H, -0.5 * b.L), 0.16 * b.H, 0.015 * b.H, 0.13 * b.L, b.metaAt(1.2, F));
    b.limbs(PART.legHL, PART.legHR, [[0.11, 1, 0], [0.13, 0.58, 0.06], [0.12, 0.26, -0.03], [0.11, 0.03, 0.01]], [0.11, 0.05, 0.03, 0.028], MAT.skin);
    b.toes(PART.legHL, PART.legHR, [0.11, 0, 0.01], 2, 0.05, 0.035, 0.12, MAT.skin);
    // Folded wings: feathered forearms held against the body.
    b.limbs(PART.body, PART.body, [[0.12, 1.05, 0.16], [0.16, 0.92, 0.1], [0.13, 1.0, 0.21]], [0.04, 0.03, 0.02], F);
    for (const sx of [1, -1]) b.ellipsoid(V(sx * 0.17 * b.H, 0.94 * b.H, 0.13 * b.L), 0.02 * b.H, 0.13 * b.H, 0.07 * b.L, { part: PART.body, pivot: V(0, 0, 0), s: 0, mat: F }, 0.4);
    return;
  }
  if (kind === 'ornithomimid') {
    // Ostrich-like: small beaked head on a long neck, long legs, feathered, winged arms (Zelenitsky et al. 2012).
    b.setSpine([
      [-0.58, 0.82, 0.01, 0.01, F], [-0.45, 0.9, 0.025, 0.035, F], [-0.32, 0.97, 0.045, 0.06, F], [-0.18, 1.04, 0.07, 0.09, F],
      [-0.07, 1.08, 0.1, 0.13, F], [0.02, 1.1, 0.12, 0.16, F], [0.1, 1.07, 0.13, 0.18, F], [0.17, 1.1, 0.1, 0.13, F],
      [0.22, 1.3, 0.05, 0.065, F], [0.26, 1.52, 0.04, 0.05, F], [0.29, 1.68, 0.035, 0.045], [0.31, 1.74, 0.045, 0.055],
      [0.335, 1.72, 0.035, 0.04], [0.36, 1.68, 0.018, 0.02, K], [0.37, 1.66, 0.004, 0.004, K],
    ], 4, 7);
    b.eyes(11.3, 0.4, 0.022);
    b.limbs(PART.legHL, PART.legHR, [[0.1, 1, 0], [0.12, 0.6, 0.06], [0.1, 0.3, -0.02], [0.1, 0.03, 0.02]], [0.085, 0.04, 0.025, 0.022]);
    b.toes(PART.legHL, PART.legHR, [0.1, 0, 0.02], 3, 0.035, 0.02, 0.3);
    b.limbs(PART.body, PART.body, [[0.08, 1.0, 0.15], [0.1, 0.85, 0.13], [0.1, 0.72, 0.18]], [0.03, 0.02, 0.012], F);
    for (const sx of [1, -1]) b.ellipsoid(V(sx * 0.12 * b.H, 0.86 * b.H, 0.13 * b.L), 0.012 * b.H, 0.12 * b.H, 0.06 * b.L, { part: PART.body, pivot: V(0, 0, 0), s: 0, mat: F }, 0.5);
    return;
  }
  // Oviraptorosaur (Anzu): crested, toothless beak, long neck, feathered.
  b.setSpine([
    [-0.48, 0.85, 0.01, 0.01, F], [-0.38, 0.92, 0.03, 0.04, F], [-0.26, 0.99, 0.05, 0.065, F], [-0.14, 1.05, 0.08, 0.1, F],
    [-0.05, 1.08, 0.11, 0.14, F], [0.04, 1.1, 0.13, 0.17, F], [0.12, 1.07, 0.13, 0.18, F], [0.19, 1.1, 0.1, 0.13, F],
    [0.24, 1.3, 0.055, 0.07, F], [0.28, 1.5, 0.045, 0.055, F], [0.31, 1.63, 0.045, 0.06], [0.335, 1.66, 0.055, 0.08],
    [0.36, 1.62, 0.04, 0.065, K], [0.38, 1.56, 0.02, 0.035, K], [0.388, 1.53, 0.004, 0.004, K],
  ], 4, 7);
  b.eyes(11.2, 0.45, 0.022);
  const { p } = spineSurface(b.spine, 11.4, Math.PI / 2);
  b.ellipsoid(p.add(V(0, 0.05 * b.H, 0)), 0.01 * b.H, 0.08 * b.H, 0.03 * b.L, b.metaAt(11.4, K), -0.3);
  b.limbs(PART.legHL, PART.legHR, [[0.1, 1, 0], [0.12, 0.6, 0.06], [0.1, 0.29, -0.02], [0.1, 0.03, 0.02]], [0.09, 0.045, 0.028, 0.024]);
  b.toes(PART.legHL, PART.legHR, [0.1, 0, 0.02], 3, 0.04, 0.02, 0.3);
  b.limbs(PART.body, PART.body, [[0.09, 1.0, 0.16], [0.12, 0.85, 0.13], [0.11, 0.78, 0.2]], [0.035, 0.025, 0.015], F);
  for (const sx of [1, -1]) b.ellipsoid(V(sx * 0.13 * b.H, 0.88 * b.H, 0.14 * b.L), 0.012 * b.H, 0.13 * b.H, 0.07 * b.L, { part: PART.body, pivot: V(0, 0, 0), s: 0, mat: F }, 0.5);
}

function ornithopod(b: Body, variant: string | undefined, kind: 'hadrosaur' | 'small_ornithischian' | 'pachycephalosaur'): void {
  const K = MAT.keratin;
  if (kind === 'hadrosaur') {
    // Edmontosaurus: on all fours when browsing low; deep tail; long, flat duck-billed skull.
    b.setSpine([
      [-0.6, 0.75, 0.012, 0.02], [-0.45, 0.95, 0.04, 0.12], [-0.3, 1.08, 0.08, 0.2], [-0.15, 1.15, 0.13, 0.27],
      [0.0, 1.18, 0.2, 0.32], [0.1, 1.1, 0.25, 0.37], [0.2, 1.0, 0.2, 0.3], [0.27, 1.02, 0.12, 0.17],
      [0.31, 1.08, 0.09, 0.13], [0.34, 1.1, 0.09, 0.125], [0.37, 1.04, 0.075, 0.11], [0.4, 0.97, 0.07, 0.07],
      [0.42, 0.94, 0.08, 0.04, K], [0.428, 0.935, 0.06, 0.015, K],
    ], 4, 7);
    b.eyes(9.4, 0.5, 0.02);
    if (variant === 'olorotitan') {
      // A tall fan-shaped hollow crest.
      const { p } = spineSurface(b.spine, 9.3, Math.PI / 2);
      b.ellipsoid(p.add(V(0, 0.16 * b.H, -0.02 * b.L)), 0.025 * b.H, 0.2 * b.H, 0.05 * b.L, b.metaAt(9.3, MAT.skin), -0.5);
    } else if (variant === 'arenysaurus') {
      const { p } = spineSurface(b.spine, 9.4, Math.PI / 2);
      b.ellipsoid(p.add(V(0, 0.05 * b.H, 0)), 0.04 * b.H, 0.07 * b.H, 0.035 * b.L, b.metaAt(9.4, MAT.skin));
    }
    b.limbs(PART.legHL, PART.legHR, [[0.2, 1, -0.01], [0.22, 0.56, 0.05], [0.2, 0.22, -0.03], [0.2, 0.02, 0.0]], [0.15, 0.075, 0.05, 0.05]);
    b.toes(PART.legHL, PART.legHR, [0.2, 0, 0.0], 3, 0.025, 0.035, 0.35);
    b.limbs(PART.legFL, PART.legFR, [[0.16, 0.85, 0.2], [0.18, 0.52, 0.18], [0.17, 0.16, 0.22], [0.17, 0.02, 0.225]], [0.07, 0.045, 0.03, 0.032]);
    return;
  }
  if (kind === 'pachycephalosaur') {
    b.setSpine([
      [-0.55, 0.85, 0.01, 0.01], [-0.42, 0.93, 0.035, 0.05], [-0.28, 1.0, 0.06, 0.09], [-0.15, 1.06, 0.1, 0.14],
      [-0.05, 1.1, 0.15, 0.2], [0.05, 1.1, 0.18, 0.24], [0.13, 1.08, 0.16, 0.22], [0.2, 1.12, 0.1, 0.13],
      [0.25, 1.28, 0.08, 0.095], [0.29, 1.38, 0.1, 0.12], [0.325, 1.36, 0.085, 0.1], [0.355, 1.3, 0.05, 0.065],
      [0.37, 1.27, 0.03, 0.035, K], [0.375, 1.26, 0.006, 0.006, K],
    ], 4, 7);
    b.eyes(10.2, 0.4, 0.025);
    // The thick bony dome, ringed by small knobs.
    const { p } = spineSurface(b.spine, 9.7, Math.PI / 2);
    b.ellipsoid(p.add(V(0, 0.02 * b.H, 0)), 0.1 * b.H, 0.09 * b.H, 0.055 * b.L, b.metaAt(9.7, K));
    if (b.r.detail) for (const sx of [1, -1]) for (let i = 0; i < 4; i++) {
      const s = spineSurface(b.spine, 9.2 + i * 0.25, 0.9, sx as 1 | -1);
      b.horn([s.p, s.p.clone().addScaledVector(s.n, 0.035 * b.H)], 0.015 * b.H, b.metaAt(9.2 + i * 0.25, K));
    }
  } else {
    // Thescelosaurus: small beaked head, long stiffened tail, strong legs, grasping hands.
    b.setSpine([
      [-0.6, 0.9, 0.01, 0.01], [-0.46, 0.97, 0.03, 0.045], [-0.32, 1.03, 0.055, 0.08], [-0.18, 1.08, 0.09, 0.12],
      [-0.06, 1.12, 0.14, 0.18], [0.04, 1.12, 0.17, 0.22], [0.12, 1.1, 0.15, 0.2], [0.19, 1.13, 0.1, 0.13],
      [0.24, 1.27, 0.07, 0.085], [0.28, 1.36, 0.075, 0.09], [0.315, 1.34, 0.06, 0.075], [0.34, 1.29, 0.035, 0.045, K],
      [0.35, 1.27, 0.006, 0.006, K],
    ], 4, 7);
    b.eyes(9.5, 0.4, 0.025);
  }
  b.limbs(PART.legHL, PART.legHR, [[0.14, 1, 0], [0.16, 0.56, 0.06], [0.14, 0.24, -0.025], [0.14, 0.03, 0.01]], [0.12, 0.06, 0.035, 0.03]);
  b.toes(PART.legHL, PART.legHR, [0.14, 0, 0.01], 3, 0.035, 0.025, 0.3);
  b.limbs(PART.body, PART.body, [[0.12, 1.02, 0.15], [0.15, 0.8, 0.14], [0.13, 0.68, 0.2]], [0.045, 0.03, 0.018]);
}

function ceratopsid(b: Body, variant: string | undefined): void {
  const K = MAT.keratin;
  // Triceratops: barrel body, the head a quarter of the animal's length, frill, three horns, beak.
  b.setSpine([
    [-0.4, 0.7, 0.012, 0.012], [-0.32, 0.82, 0.06, 0.08], [-0.21, 0.95, 0.12, 0.14], [-0.1, 1.05, 0.22, 0.22],
    [0.0, 1.08, 0.3, 0.3], [0.12, 1.0, 0.38, 0.38], [0.24, 0.95, 0.32, 0.33], [0.3, 0.92, 0.2, 0.22],
    [0.34, 0.9, 0.22, 0.25], [0.4, 0.82, 0.16, 0.22], [0.45, 0.72, 0.1, 0.16], [0.48, 0.64, 0.05, 0.08, K],
    [0.49, 0.6, 0.01, 0.01, K],
  ], 3, 7, 0.92);
  b.eyes(9.3, 0.55, 0.018);
  const big = variant === 'torosaurus' ? 1.25 : 1;
  // Frill: a broad plate sweeping up and back from the back of the skull.
  b.ellipsoid(V(0, 1.2 * b.H, 0.31 * b.L), 0.46 * big * b.H, 0.11 * b.H, 0.42 * big * b.H, b.metaAt(8.3, MAT.skin), 0.7);
  if (b.r.detail) {
    // Epoccipitals: the bony knobs around the frill's edge.
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.1 + 0.8 * (i / 10));
      const c = V(Math.cos(a) * 0.46 * big * b.H, 1.2 * b.H, 0.31 * b.L);
      const lift = Math.sin(a) * 0.42 * big * b.H;
      c.y += lift * Math.sin(0.7); c.z -= lift * Math.cos(0.7);
      b.ellipsoid(c, 0.04 * b.H, 0.04 * b.H, 0.04 * b.H, b.metaAt(8.3, K));
    }
  }
  // Brow horns (forward and up) and a short nose horn.
  for (const sx of [1, -1]) {
    const base = V(sx * 0.09 * b.H, 1.02 * b.H, 0.39 * b.L);
    b.horn([base, base.clone().add(V(sx * 0.03 * b.H, 0.14 * b.H, 0.05 * b.L)), base.clone().add(V(sx * 0.04 * b.H, 0.22 * b.H, 0.13 * b.L))], 0.055 * b.H, b.metaAt(9.0, K));
  }
  const nb = V(0, 0.84 * b.H, 0.455 * b.L);
  b.horn([nb, nb.clone().add(V(0, 0.07 * b.H, 0.01 * b.L)), nb.clone().add(V(0, 0.11 * b.H, 0.025 * b.L))], 0.04 * b.H, b.metaAt(10.5, K));
  b.limbs(PART.legHL, PART.legHR, [[0.25, 1, 0], [0.27, 0.55, 0.04], [0.25, 0.18, -0.02], [0.25, 0.0, 0.0]], [0.17, 0.11, 0.08, 0.1]);
  b.limbs(PART.legFL, PART.legFR, [[0.3, 0.85, 0.24], [0.37, 0.5, 0.21], [0.33, 0.15, 0.25], [0.33, 0.0, 0.255]], [0.13, 0.09, 0.07, 0.09]);
}

function ankylosaur(b: Body): void {
  const K = MAT.keratin;
  // Low, broad and armoured; the tail ends in a bony club.
  b.setSpine([
    [-0.62, 0.55, 0.02, 0.02], [-0.58, 0.56, 0.06, 0.045], [-0.42, 0.7, 0.08, 0.075], [-0.22, 0.88, 0.2, 0.16],
    [0.0, 1.0, 0.62, 0.36], [0.12, 0.98, 0.72, 0.38], [0.24, 0.92, 0.58, 0.32], [0.3, 0.85, 0.3, 0.2],
    [0.34, 0.8, 0.3, 0.2], [0.39, 0.74, 0.24, 0.14], [0.42, 0.7, 0.12, 0.08, K], [0.425, 0.69, 0.02, 0.02, K],
  ], 3, 7, 0.85);
  b.eyes(8.6, 0.4, 0.03);
  // Tail club and the horns at the back corners of the skull.
  b.ellipsoid(V(0, 0.55 * b.H, -0.61 * b.L), 0.24 * b.H, 0.12 * b.H, 0.05 * b.L, b.metaAt(0.2, K));
  for (const sx of [1, -1]) {
    const s = spineSurface(b.spine, 8.2, 0.5, sx as 1 | -1);
    b.horn([s.p, s.p.clone().add(V(sx * 0.1 * b.H, 0.02 * b.H, -0.03 * b.L))], 0.05 * b.H, b.metaAt(8.2, K));
  }
  if (b.r.detail) {
    // Rows of keeled osteoderms over the back and flanks.
    for (let row = 0; row < 7; row++) {
      const ang = 0.35 + (row / 6) * (Math.PI - 0.7);
      for (let k = 0; k < 9; k++) {
        const u = 3.2 + (k / 8) * 3.6;
        const { p, n } = spineSurface(b.spine, u, ang, 1);
        const size = (0.06 + 0.04 * Math.sin(ang)) * b.H;
        b.horn([p, p.clone().addScaledVector(n, size)], size * 0.7, b.metaAt(u, K));
      }
    }
    // Spikes along the flanks.
    for (const sx of [1, -1]) for (let k = 0; k < 5; k++) {
      const u = 3.6 + k * 0.7;
      const { p, n } = spineSurface(b.spine, u, 0.05, sx as 1 | -1);
      b.horn([p, p.clone().addScaledVector(n, 0.16 * b.H)], 0.06 * b.H, b.metaAt(u, K));
    }
  }
  b.limbs(PART.legHL, PART.legHR, [[0.42, 0.9, -0.02], [0.47, 0.5, 0.02], [0.45, 0.16, -0.02], [0.45, 0, 0]], [0.2, 0.13, 0.1, 0.12]);
  b.limbs(PART.legFL, PART.legFR, [[0.42, 0.8, 0.22], [0.5, 0.45, 0.2], [0.46, 0.13, 0.23], [0.46, 0, 0.235]], [0.16, 0.11, 0.09, 0.1]);
}

function sauropod(b: Body): void {
  // Titanosaur: deep body, long neck held up and forward, small head, long whip-like tail, column legs.
  b.setSpine([
    [-0.55, 0.55, 0.005, 0.005], [-0.45, 0.75, 0.025, 0.035], [-0.3, 0.95, 0.06, 0.08], [-0.15, 1.15, 0.15, 0.2],
    [0.0, 1.3, 0.35, 0.42], [0.1, 1.3, 0.45, 0.5], [0.18, 1.35, 0.38, 0.42], [0.24, 1.6, 0.18, 0.2],
    [0.3, 2.0, 0.12, 0.14], [0.36, 2.4, 0.08, 0.1], [0.42, 2.7, 0.06, 0.07], [0.445, 2.76, 0.065, 0.075],
    [0.46, 2.72, 0.04, 0.045], [0.468, 2.69, 0.01, 0.01],
  ], 3, 7, 0.9);
  b.eyes(11.3, 0.5, 0.02);
  b.limbs(PART.legHL, PART.legHR, [[0.3, 1.05, -0.02], [0.33, 0.55, 0.0], [0.32, 0.18, -0.01], [0.32, 0, 0]], [0.2, 0.13, 0.11, 0.13]);
  b.limbs(PART.legFL, PART.legFR, [[0.28, 1.15, 0.17], [0.31, 0.62, 0.165], [0.3, 0.18, 0.175], [0.3, 0, 0.175]], [0.16, 0.11, 0.1, 0.12]);
}

function sprawler(b: Body, kind: 'crocodylian' | 'champsosaur' | 'lizard'): void {
  const narrow = kind === 'champsosaur';
  // Long low body, laterally flattened tail, legs out to the sides.
  const snout: N[] = narrow
    ? [[0.29, 0.86, 0.26, 0.24], [0.32, 0.82, 0.16, 0.15], [0.37, 0.78, 0.07, 0.07], [0.43, 0.75, 0.05, 0.05], [0.47, 0.74, 0.035, 0.035], [0.475, 0.74, 0.008, 0.008]]
    : [[0.29, 0.86, 0.3, 0.24], [0.33, 0.8, 0.26, 0.17], [0.38, 0.74, 0.18, 0.12], [0.43, 0.7, 0.12, 0.09], [0.45, 0.69, 0.07, 0.06], [0.455, 0.69, 0.01, 0.01]];
  b.setSpine([
    [-0.55, 0.55, 0.02, 0.02], [-0.42, 0.65, 0.07, 0.15], [-0.28, 0.75, 0.13, 0.25], [-0.14, 0.85, 0.24, 0.32],
    [-0.05, 0.9, 0.38, 0.34], [0.05, 0.92, 0.55, 0.38], [0.15, 0.9, 0.5, 0.36], [0.24, 0.86, 0.34, 0.28],
    ...snout,
  ], 4, 7, 0.75);
  b.eyes(8.6, 0.85, 0.045);
  if (b.r.detail && kind === 'crocodylian') {
    // Two rows of armoured scutes down the back and tail.
    for (const sx of [1, -1]) for (let k = 0; k < 14; k++) {
      const u = 1 + (k / 13) * 6;
      const { p, n } = spineSurface(b.spine, u, 1.25, sx as 1 | -1);
      b.horn([p, p.clone().addScaledVector(n, 0.07 * b.H)], 0.06 * b.H, b.metaAt(u, MAT.keratin));
    }
  }
  b.limbs(PART.legHL, PART.legHR, [[0.35, 0.85, -0.02], [0.9, 0.78, 0.0], [0.95, 0.35, 0.0], [1.0, 0.02, 0.03]], [0.2, 0.12, 0.09, 0.08]);
  b.limbs(PART.legFL, PART.legFR, [[0.35, 0.82, 0.19], [0.8, 0.74, 0.18], [0.85, 0.32, 0.2], [0.88, 0.02, 0.22]], [0.16, 0.1, 0.08, 0.07]);
  b.toes(PART.legHL, PART.legHR, [1.0, 0, 0.03], 4, 0.03, 0.05, 0.6);
  b.toes(PART.legFL, PART.legFR, [0.88, 0, 0.22], 4, 0.025, 0.045, 0.7);
}

function mammal(b: Body, variant: string | undefined): void {
  // Widths in units of L here: hip heights of small mammals say little about their girth.
  const k = b.L / b.H;
  const stocky = b.H / b.L >= 0.35;
  if (stocky) {
    // Condylarths (Ectoconus, Eoconodon, Carsioptychus): stocky, pig- to sheep-sized, hoofed, a
    // medium tail.
    b.setSpine([
      [-0.5, 0.75, 0.008, 0.008], [-0.42, 0.88, 0.015, 0.016], [-0.33, 0.98, 0.022, 0.024], [-0.25, 1.05, 0.03, 0.035],
      [-0.18, 1.08, 0.1, 0.11], [-0.05, 1.08, 0.13, 0.15], [0.1, 1.1, 0.13, 0.15], [0.2, 1.15, 0.1, 0.12],
      [0.26, 1.25, 0.065, 0.075], [0.31, 1.32, 0.06, 0.065], [0.35, 1.32, 0.065, 0.07], [0.41, 1.25, 0.045, 0.05],
      [0.45, 1.18, 0.025, 0.03], [0.46, 1.17, 0.006, 0.006],
    ], 3, 8, 0.9, b.L);
    b.eyes(10.3, 0.5, 0.016 * k);
    if (b.r.detail) for (const sx of [1, -1]) {
      const { p } = spineSurface(b.spine, 9.9, 1.1, sx as 1 | -1);
      b.ellipsoid(p.add(V(0, 0.02 * b.L, -0.01 * b.L)), 0.012 * b.L, 0.03 * b.L, 0.012 * b.L, b.metaAt(9.9, MAT.skin), -0.4);
    }
    b.limbs(PART.legHL, PART.legHR, [[0.09 * k, 1.0, -0.13], [0.1 * k, 0.6, -0.08], [0.09 * k, 0.25, -0.16], [0.09 * k, 0.02, -0.14]], [0.06 * k, 0.035 * k, 0.025 * k, 0.025 * k]);
    b.limbs(PART.legFL, PART.legFR, [[0.08 * k, 1.0, 0.17], [0.09 * k, 0.6, 0.13], [0.085 * k, 0.15, 0.17], [0.085 * k, 0.02, 0.18]], [0.05 * k, 0.03 * k, 0.022 * k, 0.022 * k]);
    return;
  }
  // Small, low mammals (Didelphodon, multituberculates, Purgatorius): long body, pointed snout, long
  // tail; multituberculates have short, deep, rodent-like heads.
  const rodent = variant === 'mesodma' || variant === 'taeniolabis';
  b.setSpine([
    [-0.55, 0.5, 0.006, 0.006], [-0.42, 0.75, 0.012, 0.012], [-0.28, 0.95, 0.018, 0.018], [-0.14, 1.05, 0.025, 0.025],
    [-0.08, 1.08, 0.06, 0.065], [0.05, 1.1, 0.075, 0.08], [0.17, 1.1, 0.07, 0.075], [0.25, 1.15, 0.05, 0.055],
    [0.3, 1.25, 0.05, 0.05], [0.35, 1.22, rodent ? 0.045 : 0.035, rodent ? 0.045 : 0.035],
    [rodent ? 0.38 : 0.4, 1.15, 0.015, 0.015], [rodent ? 0.385 : 0.415, 1.13, 0.004, 0.004],
  ], 3, 7, 0.9, b.L);
  b.eyes(8.6, 0.5, 0.009 * k);
  if (b.r.detail) for (const sx of [1, -1]) {
    const { p } = spineSurface(b.spine, 8.3, 1.0, sx as 1 | -1);
    b.ellipsoid(p, 0.014 * b.L, 0.018 * b.L, 0.004 * b.L, b.metaAt(8.3, MAT.skin));
  }
  b.limbs(PART.legHL, PART.legHR, [[0.05 * k, 1.0, -0.06], [0.06 * k, 0.55, 0.0], [0.055 * k, 0.25, -0.08], [0.055 * k, 0.02, -0.05]], [0.035 * k, 0.022 * k, 0.015 * k, 0.015 * k]);
  b.limbs(PART.legFL, PART.legFR, [[0.05 * k, 1.0, 0.18], [0.055 * k, 0.55, 0.14], [0.05 * k, 0.15, 0.18], [0.05 * k, 0.02, 0.2]], [0.03 * k, 0.018 * k, 0.012 * k, 0.012 * k]);
}

function bird(b: Body, variant: string | undefined): void {
  const F = MAT.feather, K = MAT.keratin;
  const duck = variant === 'vegavis' || variant === 'asteriornis';
  const bill: N[] = duck
    ? [[0.42, 2.35, 0.18, 0.12, K], [0.47, 2.3, 0.14, 0.05, K], [0.49, 2.29, 0.1, 0.02, K]]
    : [[0.42, 2.36, 0.1, 0.09, K], [0.47, 2.32, 0.04, 0.04, K], [0.5, 2.3, 0.008, 0.008, K]];
  b.setSpine([
    [-0.44, 1.5, 0.22, 0.02, F], [-0.34, 1.56, 0.25, 0.06, F], [-0.2, 1.6, 0.3, 0.3, F], [-0.05, 1.65, 0.36, 0.42, F],
    [0.1, 1.72, 0.35, 0.42, F], [0.22, 1.9, 0.22, 0.24, F], [0.3, 2.2, 0.16, 0.16, F], [0.35, 2.38, 0.17, 0.18, F],
    [0.39, 2.4, 0.14, 0.15, F], ...bill,
  ], 2, 5, 0.9);
  b.eyes(7.4, 0.45, 0.05);
  // Folded wings over the flanks.
  for (const [part, sx] of [[PART.wingL, 1], [PART.wingR, -1]] as const) {
    b.ellipsoid(V(sx * 0.33 * b.H, 1.7 * b.H, -0.02 * b.L), 0.05 * b.H, 0.28 * b.H, 0.3 * b.L, { part, pivot: V(sx * 0.3 * b.H, 1.85 * b.H, 0.1 * b.L), s: 0, mat: F }, 0.15);
  }
  b.limbs(PART.legHL, PART.legHR, [[0.18, 1.35, 0], [0.22, 1.0, 0.06], [0.2, 0.55, -0.05], [0.2, 0.03, 0.0]], [0.12, 0.06, 0.04, 0.035]);
  b.toes(PART.legHL, PART.legHR, [0.2, 0, 0.0], 3, 0.09, 0.03, 0.4);
}

function turtle(b: Body): void {
  // A domed land-turtle shell (Basilemys), plastron, head, tail and stout legs.
  const L = b.L, H = b.H;
  b.setSpine([[-0.5, 0.75, 0.04, 0.04], [-0.42, 0.85, 0.09, 0.09], [-0.36, 0.95, 0.15, 0.15], [0.33, 0.95, 0.15, 0.15], [0.38, 0.95, 0.2, 0.2], [0.44, 0.92, 0.25, 0.22], [0.5, 0.88, 0.2, 0.16], [0.53, 0.86, 0.04, 0.04]], 2, 3, 1);
  b.eyes(5.3, 0.5, 0.04);
  b.ellipsoid(V(0, 0.95 * H, 0), 0.36 * L, 0.2 * L, 0.42 * L, { part: PART.body, pivot: V(0, 0, 0), s: 0, mat: MAT.keratin });
  b.ellipsoid(V(0, 0.75 * H, 0), 0.33 * L, 0.04 * L, 0.39 * L, { part: PART.body, pivot: V(0, 0, 0), s: 0, mat: MAT.belly });
  b.limbs(PART.legFL, PART.legFR, [[0.85, 0.8, 0.22], [1.2, 0.55, 0.26], [1.22, 0.0, 0.28]], [0.15, 0.13, 0.15]);
  b.limbs(PART.legHL, PART.legHR, [[0.85, 0.8, -0.22], [1.2, 0.55, -0.24], [1.22, 0.0, -0.25]], [0.15, 0.13, 0.15]);
}

function frog(b: Body): void {
  // Squat, wide-mouthed frog (Beelzebufo): hind legs folded at the sides.
  const L = b.L;
  b.ellipsoid(V(0, 0.22 * L, 0), 0.32 * L, 0.2 * L, 0.38 * L, { part: PART.body, pivot: V(0, 0, 0), s: 0, mat: MAT.skin });
  b.ellipsoid(V(0, 0.27 * L, 0.3 * L), 0.3 * L, 0.15 * L, 0.2 * L, { part: PART.head, pivot: V(0, 0.22 * L, 0.2 * L), s: 0.5, mat: MAT.skin });
  if (b.r.detail) for (const sx of [1, -1]) b.ellipsoid(V(sx * 0.17 * L, 0.38 * L, 0.33 * L), 0.05 * L, 0.05 * L, 0.05 * L, { part: PART.head, pivot: V(0, 0.22 * L, 0.2 * L), s: 0.5, mat: MAT.eye });
  for (const [part, sx] of [[PART.legHL, 1], [PART.legHR, -1]] as const) {
    b.ellipsoid(V(sx * 0.3 * L, 0.1 * L, -0.15 * L), 0.1 * L, 0.08 * L, 0.24 * L, { part, pivot: V(sx * 0.3 * L, 0.15 * L, -0.05 * L), s: 0.3, mat: MAT.skin });
  }
  b.limbs(PART.legFL, PART.legFR, [[0.22 * L / b.H, 0.16 * L / b.H, 0.2], [0.24 * L / b.H, 0.08 * L / b.H, 0.22], [0.25 * L / b.H, 0, 0.25]], [0.04 * L / b.H, 0.035 * L / b.H, 0.04 * L / b.H]);
}

function pterosaur(b: Body): void {
  const F = MAT.feather, K = MAT.keratin;
  // Azhdarchid on the ground (Witton & Naish 2008): on all fours, folded wings as long forelimbs,
  // shoulders high, stiff neck held up, a huge head with a long spear-like beak. Furry pycnofibres.
  b.setSpine([
    [-0.1, 1.15, 0.03, 0.03, F], [-0.05, 1.2, 0.12, 0.14, F], [0.0, 1.3, 0.18, 0.22, F], [0.07, 1.45, 0.2, 0.26, F],
    [0.12, 1.6, 0.16, 0.2, F], [0.18, 1.95, 0.08, 0.09, F], [0.24, 2.3, 0.065, 0.075, F], [0.28, 2.55, 0.07, 0.08, F],
    [0.31, 2.65, 0.1, 0.16], [0.37, 2.55, 0.07, 0.12, K], [0.45, 2.35, 0.045, 0.07, K], [0.54, 2.12, 0.02, 0.03, K],
    [0.58, 2.02, 0.004, 0.004, K],
  ], 1, 4, 0.95);
  b.eyes(8.3, 0.45, 0.025);
  b.limbs(PART.legFL, PART.legFR, [[0.15, 1.55, 0.12], [0.3, 1.1, 0.05], [0.28, 0.45, 0.13], [0.28, 0.02, 0.16]], [0.07, 0.05, 0.035, 0.03]);
  // The furled wing membrane along the forearm.
  for (const [part, sx] of [[PART.legFL, 1], [PART.legFR, -1]] as const) {
    b.ellipsoid(V(sx * 0.33 * b.H, 1.0 * b.H, 0.08 * b.L), 0.015 * b.H, 0.45 * b.H, 0.07 * b.L, { part, pivot: V(sx * 0.15 * b.H, 1.55 * b.H, 0.12 * b.L), s: 0.3, mat: MAT.membrane }, 0.2);
  }
  b.limbs(PART.legHL, PART.legHR, [[0.12, 1.25, -0.01], [0.14, 0.7, 0.04], [0.13, 0.25, -0.02], [0.13, 0.02, 0.02]], [0.08, 0.04, 0.03, 0.03]);
}

function mosasaur(b: Body, variant: string | undefined): void {
  // Swimmer, origin at the waterline (Lindgren et al. 2013): streamlined body, four flippers and a
  // downturned tail with a shark-like fluke. Dimensions in units of L.
  const robust = variant === 'prognathodon' ? 1.2 : 1;
  b.setSpine([
    [-0.5, -0.11, 0.008, 0.07], [-0.46, -0.07, 0.01, 0.08], [-0.41, -0.04, 0.02, 0.045], [-0.28, -0.02, 0.035, 0.045],
    [-0.14, -0.01, 0.055, 0.065], [0.0, 0.0, 0.065, 0.075], [0.12, 0.0, 0.06, 0.07], [0.22, 0.01, 0.05, 0.055],
    [0.28, 0.02, 0.045 * robust, 0.045 * robust], [0.34, 0.015, 0.035 * robust, 0.035 * robust], [0.4, 0.005, 0.02, 0.02],
    [0.43, 0.0, 0.004, 0.004],
  ].map(([z, y, w, h]) => [z, y * b.L / b.H, w * b.L / b.H, h * b.L / b.H] as N), 4, 7, 0.9);
  b.eyes(8.5, 0.5, 0.012 * b.L / b.H);
  for (const [part, sx, z, k] of [[PART.legFL, 1, 0.16, 1], [PART.legFR, -1, 0.16, 1], [PART.legHL, 1, -0.1, 0.75], [PART.legHR, -1, -0.1, 0.75]] as const) {
    b.ellipsoid(V(sx * 0.1 * b.L * k, -0.04 * b.L, z * b.L), 0.06 * b.L * k, 0.006 * b.L, 0.03 * b.L * k, { part, pivot: V(sx * 0.05 * b.L, -0.04 * b.L, z * b.L), s: 0.3, mat: MAT.skin }, 0, sx * 0.5);
  }
}

function plesiosaur(b: Body): void {
  // Elasmosaurid: a barrel body just under the surface, a very long neck raised, a small head, four
  // long flippers and a short tail. Dimensions in units of L.
  const k = b.L / b.H;
  b.setSpine([
    [-0.32, -0.03, 0.005, 0.005], [-0.25, -0.03, 0.025, 0.025], [-0.15, -0.03, 0.06, 0.05], [-0.06, -0.03, 0.09, 0.065],
    [0.04, -0.03, 0.1, 0.07], [0.12, -0.02, 0.07, 0.055], [0.2, 0.03, 0.04, 0.035], [0.3, 0.08, 0.03, 0.028],
    [0.4, 0.13, 0.024, 0.022], [0.47, 0.15, 0.024, 0.022], [0.5, 0.148, 0.016, 0.014], [0.515, 0.145, 0.003, 0.003],
  ].map(([z, y, w, h]) => [z, y * k, w * k, h * k] as N), 3, 5, 0.9);
  b.eyes(9.6, 0.5, 0.006 * k);
  for (const [part, sx, z] of [[PART.legFL, 1, 0.08], [PART.legFR, -1, 0.08], [PART.legHL, 1, -0.08], [PART.legHR, -1, -0.08]] as const) {
    b.ellipsoid(V(sx * 0.15 * b.L, -0.06 * b.L, z * b.L), 0.085 * b.L, 0.006 * b.L, 0.03 * b.L, { part, pivot: V(sx * 0.08 * b.L, -0.06 * b.L, z * b.L), s: 0.3, mat: MAT.skin }, 0, sx * 0.4);
  }
}

/** Build the body for a group at a given size and level of detail. */
export function bodyGeometry(spec: BodySpec, lod: Lod = 'hi'): BufferGeometry {
  const L = spec.lengthM;
  const H = spec.hipHeightM > 0 ? spec.hipHeightM : L * 0.25;
  const b = new Body(L, H, RES[lod]);
  const g = spec.group;
  switch (g) {
    case 'tyrannosaurid': case 'small_theropod': case 'ornithomimid': case 'oviraptorosaur': theropod(b, spec.variant, g); break;
    case 'hadrosaur': case 'small_ornithischian': case 'pachycephalosaur': ornithopod(b, spec.variant, g); break;
    case 'ceratopsid': ceratopsid(b, spec.variant); break;
    case 'ankylosaur': ankylosaur(b); break;
    case 'sauropod': sauropod(b); break;
    case 'mammal_small': mammal(b, spec.variant); break;
    case 'bird': bird(b, spec.variant); break;
    case 'turtle': turtle(b); break;
    case 'frog': frog(b); break;
    case 'pterosaur': pterosaur(b); break;
    case 'mosasaur': mosasaur(b, spec.variant); break;
    case 'plesiosaur': plesiosaur(b); break;
    case 'crocodylian': case 'champsosaur': case 'lizard': default: sprawler(b, g === 'champsosaur' ? 'champsosaur' : g === 'lizard' ? 'lizard' : 'crocodylian'); break;
  }
  return b.build();
}
