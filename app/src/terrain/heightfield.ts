/**
 * Terrain height on the CPU: the PaleoDEM (via the 8-bit height cube faces the globe already loads,
 * 40 m steps, ~10 km per pixel at 1024²) plus procedural detail below the data's resolution.
 *
 * The detail is "chosen", not data: ridged ranges where the DEM is high, gentle hills on uplands,
 * almost flat floodplains near sea level, faded to nothing at the coast so shorelines stay where the
 * data puts them. It is deterministic (seeded noise), so every viewer sees the same ground.
 */
import { Vector3 } from 'three';
import { EARTH_RADIUS } from '../config';
import { directionToFace, FACE_NAMES } from '../render/cube';
import { fbm } from './noise';

export interface HeightDecode { offset: number; step: number }

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export class Heightfield {
  private faces: Uint8Array[] = [];
  private size = 0;
  ready = false;

  constructor(readonly decode: HeightDecode) {}

  /** Decode the six height faces (`height_<face>.png`) into byte arrays. */
  async load(baseUrl: string, size: number): Promise<void> {
    const faces = await Promise.all(FACE_NAMES.map(async (f) => {
      const blob = await (await fetch(`${baseUrl}/${size}/height_${f}.png`)).blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
      const ctx = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const out = new Uint8Array(bmp.width * bmp.height);
      for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
      bmp.close();
      return out;
    }));
    this.faces = faces;
    this.size = size;
    this.ready = true;
  }

  /** PaleoDEM elevation (m) at a unit direction, bilinear. Returns 0 until loaded. */
  dem(d: Vector3): number {
    if (!this.ready) return 0;
    const { face, s, t } = directionToFace(d);
    const n = this.size;
    const x = Math.min(n - 1.001, Math.max(0, s * n - 0.5));
    const y = Math.min(n - 1.001, Math.max(0, t * n - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const f = this.faces[face];
    const v00 = f[y0 * n + x0], v10 = f[y0 * n + x0 + 1], v01 = f[(y0 + 1) * n + x0], v11 = f[(y0 + 1) * n + x0 + 1];
    const v = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
    return (v - this.decode.offset) * this.decode.step;
  }

  /**
   * Full terrain height (m): DEM plus procedural detail with wavelengths down to `minWavelength`.
   * Seafloor is returned as-is (negative); the renderer clamps the surface to sea level.
   */
  height(d: Vector3, minWavelength = 50): number {
    const h0 = this.dem(d);
    if (h0 <= 0) return h0;
    const x = d.x * EARTH_RADIUS, y = d.y * EARTH_RADIUS, z = d.z * EARTH_RADIUS;
    const coast = smooth(0, 80, h0);
    const mountain = smooth(700, 2400, h0);
    const upland = smooth(60, 700, h0) * (1 - mountain);
    let detail = 0;
    if (mountain > 0) detail += mountain * 900 * fbm(x, y, z, 40_000, minWavelength, true);
    if (upland > 0) detail += upland * 160 * fbm(x, y, z, 25_000, minWavelength);
    // Floodplains: low swells and channels only a few metres high.
    detail += (1 - mountain) * 7 * fbm(x + 913, y, z, 3_000, minWavelength);
    return h0 + coast * detail;
  }
}
