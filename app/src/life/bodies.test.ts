import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bodyGeometry, type BodyGroup } from './bodies';
import { PART } from './anatomy';

const GROUPS: [BodyGroup, number, number, string?][] = [
  ['tyrannosaurid', 12, 3.2], ['tyrannosaurid', 7.5, 2.0, 'carnotaurus'], ['small_theropod', 2.5, 0.7], ['ornithomimid', 3.8, 1.4],
  ['oviraptorosaur', 3.5, 1.5], ['hadrosaur', 11, 2.6], ['hadrosaur', 8, 2.4, 'olorotitan'], ['small_ornithischian', 3.5, 1.0],
  ['pachycephalosaur', 4.5, 1.2], ['ceratopsid', 8, 2.3], ['ankylosaur', 7, 1.3], ['sauropod', 26, 3.5], ['crocodylian', 3, 0.35],
  ['champsosaur', 1.5, 0.15], ['turtle', 0.6, 0.2], ['mammal_small', 0.1, 0.03, 'mesodma'], ['mammal_small', 1.0, 0.45],
  ['bird', 0.45, 0.12, 'vegavis'], ['frog', 0.35, 0.1], ['pterosaur', 4, 1.6], ['mosasaur', 12, 3], ['plesiosaur', 8, 2],
];

describe('animal bodies', () => {
  for (const [group, L, H, variant] of GROUPS) {
    it(`${group}${variant ? ` (${variant})` : ''} builds at both levels of detail, the right size, within budget`, () => {
      const hi = bodyGeometry({ group, lengthM: L, hipHeightM: H, variant }, 'hi');
      const lo = bodyGeometry({ group, lengthM: L, hipHeightM: H, variant }, 'lo');
      for (const g of [hi, lo]) {
        for (const a of ['position', 'normal', 'part', 'pivot', 'aChain', 'tint']) expect(g.getAttribute(a), a).toBeDefined();
        const pos = g.attributes.position.array as Float32Array;
        const nrm = g.attributes.normal.array as Float32Array;
        expect(pos.every(Number.isFinite)).toBe(true);
        expect(nrm.every(Number.isFinite)).toBe(true);
      }
      const tris = (g: typeof hi) => g.index!.count / 3;
      expect(tris(hi)).toBeLessThan(12_000);
      expect(tris(lo)).toBeLessThan(2_000);
      expect(tris(lo)).toBeLessThan(tris(hi) / 3);
      // Nose to tail about the stated length (pterosaur lengths run up the raised neck, so their straight-line
      // extent is shorter); standing on the ground, feet at most a little sunk (swimmers ride at the waterline).
      const box = new Box3().setFromBufferAttribute(hi.attributes.position as never);
      const size = box.getSize(new Vector3());
      expect(size.z / L).toBeGreaterThan(group === 'frog' || group === 'turtle' || group === 'pterosaur' ? 0.6 : 0.8);
      expect(size.z / L).toBeLessThan(1.25);
      if (group !== 'mosasaur' && group !== 'plesiosaur') expect(Math.abs(box.min.y)).toBeLessThan(0.1 * H + 0.01);
    });
  }

  it('legs carry their hip and knee so the shader can bend them', () => {
    const g = bodyGeometry({ group: 'hadrosaur', lengthM: 11, hipHeightM: 2.6 }, 'hi');
    const part = g.attributes.part.array as Float32Array, ch = g.attributes.aChain.array as Float32Array;
    let legs = 0, withKnee = 0;
    for (let i = 0; i < part.length; i++) {
      if (part[i] < PART.legFL || part[i] > PART.legHR) continue;
      legs++;
      if (ch[i * 4 + 2] > 0) withKnee++;
      expect(ch[i * 4]).toBeGreaterThanOrEqual(0);
      expect(ch[i * 4]).toBeLessThanOrEqual(1);
    }
    expect(legs).toBeGreaterThan(100);
    expect(withKnee).toBe(legs);
  });
});
