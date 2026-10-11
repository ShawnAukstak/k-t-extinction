import { describe, expect, it } from 'vitest';
import { crater } from '../physics/eiep';
import { destination } from './geo';
import { localHistory, type LocalData } from './local-history';

const site = { lat: 25.1149, lon: -71.5823 };
const base: LocalData = {
  crater: crater({ diameterM: 13e3, densityKgM3: 2630, speedMs: 20e3, angleDeg: 60, targetDensityKgM3: 2500 }),
  craterSite: site,
  craterRimKm: 92,
};

describe('local history', () => {
  it('inside the crater', () => {
    const h = localHistory({ lat: site.lat + 0.3, lon: site.lon }, base);
    expect(h.distanceKm).toBeLessThan(92);
    expect(h.rows[0].id).toBe('crater');
    expect(h.rows.find((r) => r.id === 'ejecta')).toBeUndefined();
  });

  it('at Tanis distance (~3,000 km): quake before ejecta before blast, fireball below the horizon', () => {
    const p = destination(site, 330, 3_000_000);
    const h = localHistory(p, base);
    expect(h.distanceKm).toBeCloseTo(3000, 0);
    const at = (id: string) => h.rows.find((r) => r.id === id)!;
    expect(at('seismic').arrivalS).toBeCloseTo(600, 0);
    expect(at('ejecta').arrivalS! / 60).toBeCloseTo(17, 0);
    expect(at('blast').arrivalS! / 3600).toBeCloseTo(2.5, 1);
    expect(at('fireball').arrivalS).toBeNull();
    // sorted by arrival; rows without an arrival go last
    const times = h.rows.map((r) => r.arrivalS ?? Infinity);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('near the crater the fireball can ignite trees', () => {
    const h = localHistory(destination(site, 200, 400_000), base);
    expect(h.rows.find((r) => r.id === 'fireball')!.value).toMatch(/trees alight/);
  });

  it('uses tsunami and winter data when provided, only on the ocean', () => {
    const d: LocalData = {
      ...base,
      elevationAt: () => -3000,
      tsunamiAt: () => ({ arrivalS: 5 * 3600, heightM: 12 }),
      winterAt: () => ({ times: [0, 1e6, 3e7, 9e7], light: [1, 0.05, 0.02, 0.5], tempC: [20, 15, -3, 5] }),
    };
    const h = localHistory(destination(site, 60, 5_000_000), d);
    expect(h.ocean).toBe(true);
    expect(h.rows.find((r) => r.id === 'tsunami')!.value).toContain('12 m');
    expect(h.rows.find((r) => r.id === 'darkness')!.value).toMatch(/below 10 %/);
    expect(h.rows.find((r) => r.id === 'cold')!.value).toMatch(/^-3 °C, 23 °C colder/);
    const land = localHistory(destination(site, 60, 5_000_000), { ...d, elevationAt: () => 200 });
    expect(land.rows.find((r) => r.id === 'tsunami')).toBeUndefined();
  });
});
