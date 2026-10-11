import { describe, expect, it } from 'vitest';
import { SOURCES } from './sources';
import { POIS, poiById } from './pois';
import { IMPACT } from '../config';

describe('points of interest', () => {
  it('all have 65 Ma positions, notes and resolvable sources', () => {
    expect(POIS.length).toBeGreaterThan(15);
    for (const p of POIS) {
      expect(Math.abs(p.paleo.lat)).toBeLessThanOrEqual(90);
      expect(p.note.length).toBeGreaterThan(20);
      for (const s of p.sources) expect(SOURCES[s], `${p.id} cites ${s}`).toBeDefined();
    }
  });
  it('places the crater where the scenario does', () => {
    const c = poiById('chicxulub')!;
    expect(c.paleo.lat).toBeCloseTo(IMPACT.site.value.lat, 3);
    expect(c.paleo.lon).toBeCloseTo(IMPACT.site.value.lon, 3);
  });
});
