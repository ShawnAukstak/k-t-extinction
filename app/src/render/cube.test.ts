import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { cellsAround, directionToFace, faceDirection } from './cube';

describe('cube sphere', () => {
  it('directionToFace inverts faceDirection on every face', () => {
    for (let f = 0; f < 6; f++) for (const [s, t] of [[0.1, 0.2], [0.5, 0.5], [0.93, 0.07]]) {
      const g = directionToFace(faceDirection(f, s, t));
      expect(g.face).toBe(f);
      expect(g.s).toBeCloseTo(s, 9);
      expect(g.t).toBeCloseTo(t, 9);
    }
  });

  it('cellsAround keeps the full window when it crosses a face edge', () => {
    const n = 2 ** 11;
    for (let f = 0; f < 6; f++) {
      const cells = cellsAround(f, n - 1, n >> 1, 2, n); // on the s = 1 edge
      expect(cells.length).toBe(25);
      expect(new Set(cells.map((c) => c.face)).size).toBe(2);
      // Every cell is near the centre cell: within ~3 cells' angular size.
      const c0 = faceDirection(f, (n - 0.5) / n, (n / 2 + 0.5) / n);
      const cellAngle = (Math.PI / 2) / n;
      for (const c of cells) {
        const d = faceDirection(c.face, (c.x + 0.5) / n, (c.y + 0.5) / n, new Vector3());
        expect(Math.acos(Math.min(1, d.dot(c0)))).toBeLessThan(3.2 * cellAngle);
      }
    }
  });

  it('cellsAround at a cube corner touches three faces without duplicates', () => {
    const n = 2 ** 11;
    const cells = cellsAround(4, n - 1, n - 1, 2, n);
    expect(new Set(cells.map((c) => `${c.face}/${c.x}/${c.y}`)).size).toBe(cells.length);
    expect(new Set(cells.map((c) => c.face)).size).toBe(3);
  });
});
