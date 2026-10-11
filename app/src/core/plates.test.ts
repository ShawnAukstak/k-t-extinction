import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Plates, type PlatesData } from './plates';

const file = resolve(__dirname, '../../public/data/places/plates65.json');
const have = existsSync(file);

// GPlates Web Service, PALEOMAP, 65 Ma (2026-10-11); also scripts/tests/test_plates.py.
const REF: [string, number, number, number, number][] = [
  ['chicxulub', 21.29, -89.53, 25.1149, -71.5823],
  ['tanis', 46.0218, -103.791, 51.6738, -79.5993],
  ['deccan', 18.85, 73.72, -22.1954, 57.1253],
  ['seymour', -64.233, -56.617, -63.6118, -67.2653],
  ['el-kef', 36.1537, 8.6486, 25.917, 6.2836],
  ['gubbio', 43.3655, 12.5826, 32.5114, 11.1],
];

describe.skipIf(!have)('plate reconstruction (needs scripts/process_places.py output)', () => {
  it('matches the GPlates Web Service', () => {
    const plates = new Plates(JSON.parse(readFileSync(file, 'utf8')) as PlatesData);
    for (const [name, la, lo, ela, elo] of REF) {
      const r = plates.reconstruct(la, lo)!;
      expect(r, name).not.toBeNull();
      // polygons are stored at 0.01° here, so allow a few km
      expect(r.lat, name).toBeCloseTo(ela, 1);
      expect(r.lon, name).toBeCloseTo(elo, 1);
    }
  });

  it('does not put West Africa on the Pacific plate (its antipode)', () => {
    const plates = new Plates(JSON.parse(readFileSync(file, 'utf8')) as PlatesData);
    const lagos = plates.reconstruct(6.52, 3.38)!;
    for (const [la, lo] of [[5.56, -0.2], [5.36, -4.0], [12.37, -1.52]]) {
      const r = plates.reconstruct(la, lo)!;
      expect(r.plate).not.toBe(901);
      expect(Math.hypot(r.lat - lagos.lat, r.lon - lagos.lon)).toBeLessThan(12);
    }
    expect(plates.reconstruct(21.3, -157.86)!.plate).toBe(901); // Honolulu
  });
});
