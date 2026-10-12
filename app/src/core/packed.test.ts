import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { filter, isPacked, pack, unfilter, unpack } from './packed';

const gzip = (b: Uint8Array) => new Uint8Array(gzipSync(b, { level: 9 }));

/** A smooth 16-bit field with some noise, like the tsunami arrival times. */
function smooth16(n: number): Uint8Array {
  const v = new Uint16Array(n);
  for (let i = 0; i < n; i++) v[i] = (20000 + 15000 * Math.sin(i / 300) + ((i * 7919) % 13)) & 0xffff;
  return new Uint8Array(v.buffer);
}

describe('packed binary data', () => {
  it('filters reversibly for every packing', () => {
    const src = smooth16(5000);
    for (const p of [{ size: 1, delta: false }, { size: 1, delta: true }, { size: 2, delta: false }, { size: 2, delta: true }] as const) {
      expect(unfilter(filter(src, p), p)).toEqual(src);
    }
  });

  it('round-trips through pack and unpack, and picks a filter that helps', async () => {
    const src = smooth16(200_000);
    const packed = pack(src, gzip);
    expect(isPacked(packed)).toBe(true);
    expect(packed[4]).toBe(2);
    expect(packed.length).toBeLessThan(gzip(src).length * 0.8);
    const out = new Uint8Array(await unpack(packed.slice().buffer));
    expect(out).toEqual(src);
  });

  it('handles odd lengths and leaves unpacked files alone', async () => {
    const odd = new Uint8Array(1001).map((_, i) => (i * 31) & 0xff);
    expect(new Uint8Array(await unpack(pack(odd, gzip).slice().buffer))).toEqual(odd);
    const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Uint8Array(await unpack(raw.buffer))).toEqual(raw);
  });
});
