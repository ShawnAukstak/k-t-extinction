import { describe, expect, it } from 'vitest';
import { IMPACT, SKY, YEAR_S } from '../config';
import { DAY_LENGTH_S, localSolarTime, subsolarPoint } from './sun';

describe('sun', () => {
  it('puts the impact site at the chosen local time at T=0', () => {
    expect(localSolarTime(IMPACT.site.value.lon, 0)).toBeCloseTo(SKY.localSolarTimeH.value, 9);
    expect(subsolarPoint(0).lat).toBeCloseTo(SKY.declinationDeg.value, 9);
  });
  it('advances local time by 2 h after 2/24 of a 66 Ma day', () => {
    expect(localSolarTime(IMPACT.site.value.lon, DAY_LENGTH_S / 12)).toBeCloseTo(SKY.localSolarTimeH.value + 2, 6);
  });
  it('goes through the seasons', () => {
    const lats = Array.from({ length: 12 }, (_, i) => subsolarPoint((i / 12) * YEAR_S).lat);
    expect(Math.max(...lats)).toBeGreaterThan(22);
    expect(Math.min(...lats)).toBeLessThan(-22);
  });
  it('stays finite a million years later', () => {
    const p = subsolarPoint(1e6 * YEAR_S);
    expect(Number.isFinite(p.lat) && Number.isFinite(p.lon)).toBe(true);
  });
});
