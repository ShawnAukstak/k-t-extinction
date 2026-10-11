/**
 * Tileable detail noise for ground-level shading: a 256² RGBA texture whose R channel is periodic
 * fractal value noise and G/B its surface normal (x, y), A a second, decorrelated noise. Sampled by
 * the globe shader at several scales of the per-vertex `detail` coordinate (metres, wrapped).
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from 'three';

/** Period (m) of the per-vertex detail coordinate; every shader scale must divide it. */
export const DETAIL_PERIOD_M = 4096;

function periodicNoise(size: number, cells: number, seed: number): Float32Array {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new Float32Array(cells * cells).map(() => rnd());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => g[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    out[y * size + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }
  return out;
}

export function makeDetailTexture(size = 256): DataTexture {
  const h = new Float32Array(size * size);
  const h2 = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (const [cells, seed] of [[4, 11], [8, 23], [16, 37], [32, 51], [64, 73]] as const) {
    const n = periodicNoise(size, cells, seed);
    const n2 = periodicNoise(size, cells, seed + 1000);
    for (let i = 0; i < h.length; i++) { h[i] += n[i] * amp; h2[i] += n2[i] * amp; }
    norm += amp;
    amp *= 0.55;
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const v = h[i] / norm;
    const dx = (h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)]) / norm;
    const dy = (h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x]) / norm;
    data[i * 4] = Math.round(v * 255);
    data[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - dx * 6)) * 255);
    data[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, 0.5 - dy * 6)) * 255);
    data[i * 4 + 3] = Math.round((h2[i] / norm) * 255);
  }
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
