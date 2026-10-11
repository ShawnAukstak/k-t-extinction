/**
 * Low-poly Cretaceous plants, built procedurally (no asset files). Proportions are generic and
 * stylised ("chosen"); the mix of forms follows the fossil record: angiosperm trees dominant in warm
 * lowlands, conifers (taxodiaceous, araucarian, podocarp) widespread and dominant when cool, palms in
 * the warm south, tree ferns and cycads in the understorey. No grass: grasses existed but did not
 * form grasslands until much later.
 *
 * Each geometry has position, normal and a `part` attribute (0 trunk, 1 foliage) so the shader can
 * colour, kill, scorch or snow the foliage separately. Units: metres, base at the origin, +y up.
 */
import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Matrix4, PlaneGeometry, Vector3 } from 'three';

export type PlantKind = 'conifer' | 'broadleaf' | 'palm' | 'treefern' | 'cycad' | 'shrub';

function withPart(g: BufferGeometry, part: number, m: Matrix4): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.applyMatrix4(m);
  const n = ng.attributes.position.count;
  ng.setAttribute('part', new BufferAttribute(new Float32Array(n).fill(part), 1));
  ng.deleteAttribute('uv');
  return ng;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), part = new Float32Array(count);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    part.set(p.attributes.part.array as Float32Array, o);
    o += p.attributes.position.count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('part', new BufferAttribute(part, 1));
  g.computeBoundingSphere();
  return g;
}

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

/** Jitter vertices a little so canopies aren't perfect spheres. */
function lumpy(g: BufferGeometry, amount: number, seed: number): BufferGeometry {
  const p = g.attributes.position as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 3.7 + seed * 2);
    v.multiplyScalar(1 + amount * k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function plantGeometry(kind: PlantKind): BufferGeometry {
  switch (kind) {
    case 'conifer': {
      // Tall, narrow: Metasequoia/Araucaria-like silhouette, ~22 m.
      const trunk = withPart(new CylinderGeometry(0.25, 0.45, 22, 5), 0, T(0, 11, 0));
      const tiers = [0, 1, 2, 3].map((i) => withPart(new ConeGeometry(3.4 - i * 0.7, 7, 6), 1, T(0, 7 + i * 4.2, 0)));
      return merge([trunk, ...tiers]);
    }
    case 'broadleaf': {
      // Angiosperm tree with a broad, lumpy crown, ~18 m.
      const trunk = withPart(new CylinderGeometry(0.35, 0.6, 10, 5), 0, T(0, 5, 0));
      const crown = [[0, 12, 0, 5.5], [2.8, 10.5, 1.2, 3.6], [-2.6, 11, -1.4, 3.8], [0.6, 14.5, -1.8, 3.4]].map(([x, y, z, r], i) =>
        withPart(lumpy(new IcosahedronGeometry(r, 1), 0.18, i + 1), 1, T(x, y, z)));
      return merge([trunk, ...crown]);
    }
    case 'palm': {
      const trunk = withPart(new CylinderGeometry(0.22, 0.32, 12, 5), 0, T(0, 6, 0));
      const leaves: BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const leaf = new PlaneGeometry(1.0, 5.5, 1, 3);
        leaf.translate(0, 2.75, 0);
        const m = new Matrix4().makeTranslation(0, 12, 0)
          .multiply(new Matrix4().makeRotationY(a))
          .multiply(new Matrix4().makeRotationX(1.05 + (i % 2) * 0.25));
        leaves.push(withPart(leaf, 1, m));
      }
      return merge([trunk, ...leaves]);
    }
    case 'treefern': {
      const trunk = withPart(new CylinderGeometry(0.18, 0.25, 4.5, 5), 0, T(0, 2.25, 0));
      const fronds: BufferGeometry[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const f = new PlaneGeometry(0.7, 3.2, 1, 3);
        f.translate(0, 1.6, 0);
        const m = new Matrix4().makeTranslation(0, 4.5, 0).multiply(new Matrix4().makeRotationY(a)).multiply(new Matrix4().makeRotationX(1.2));
        fronds.push(withPart(f, 1, m));
      }
      return merge([trunk, ...fronds]);
    }
    case 'cycad': {
      const trunk = withPart(new CylinderGeometry(0.35, 0.45, 1.6, 6), 0, T(0, 0.8, 0));
      const fronds: BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = new PlaneGeometry(0.45, 1.8, 1, 2);
        f.translate(0, 0.9, 0);
        const m = new Matrix4().makeTranslation(0, 1.6, 0).multiply(new Matrix4().makeRotationY(a)).multiply(new Matrix4().makeRotationX(0.9));
        fronds.push(withPart(f, 1, m));
      }
      return merge([trunk, ...fronds]);
    }
    case 'shrub':
    default: {
      const body = [[0, 0.9, 0, 1.2], [0.8, 0.7, 0.3, 0.8], [-0.6, 0.8, -0.4, 0.9]].map(([x, y, z, r], i) =>
        withPart(lumpy(new IcosahedronGeometry(r, 0), 0.25, i + 7), 1, T(x, y, z)));
      return merge(body);
    }
  }
}

/** Which plants grow in each vegetation class, with relative weights (by temperature where relevant). */
export function plantMix(cls: string, tempC: number): [PlantKind, number][] {
  const warm = Math.min(1, Math.max(0, (tempC - 12) / 12));
  switch (cls) {
    case 'tropical_forest': return [['broadleaf', 0.55], ['palm', 0.2], ['treefern', 0.15], ['cycad', 0.1]];
    case 'warm_forest': return [['broadleaf', 0.45], ['conifer', 0.3 - 0.15 * warm], ['palm', 0.1 * warm], ['treefern', 0.08], ['cycad', 0.07]];
    case 'cool_forest': return [['conifer', 0.65], ['broadleaf', 0.3], ['shrub', 0.05]];
    case 'wetland': return [['conifer', 0.45], ['palm', 0.2 + 0.1 * warm], ['treefern', 0.2], ['shrub', 0.15]];
    case 'fern_savanna': return [['shrub', 0.45], ['cycad', 0.25], ['conifer', 0.2], ['broadleaf', 0.1]];
    case 'arid_shrub': return [['shrub', 0.7], ['cycad', 0.3]];
    default: return [];
  }
}
