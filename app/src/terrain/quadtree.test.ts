import { ShaderMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { faceDirection } from '../render/cube';
import type { Heightfield } from './heightfield';
import { Quadtree } from './quadtree';

const flat = { height: () => 0, dem: () => 0, ready: true } as unknown as Heightfield;

describe('terrain quadtree', () => {
  it('a tile’s angular radius covers its whole footprint (cube faces are distorted)', () => {
    const q = new Quadtree(new ShaderMaterial(), flat, { segments: 8, maxLevel: 10, pixelError: 8, maxTiles: 100, buildsPerFrame: 4 });
    const tileOf = (q as unknown as { tile: (f: number, l: number, x: number, y: number) => { center: Vector3; angularRadius: number } }).tile.bind(q);
    for (const [f, l, x, y] of [[2, 1, 0, 0], [0, 0, 0, 0], [4, 3, 7, 0], [5, 2, 1, 3]]) {
      const t = tileOf(f, l, x, y);
      const size = 1 / 2 ** l;
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        const d = faceDirection(f, (x + i / 10) * size, (y + j / 10) * size, new Vector3());
        expect(Math.acos(Math.min(1, d.dot(t.center)))).toBeLessThanOrEqual(t.angularRadius + 1e-9);
      }
    }
  });
});
