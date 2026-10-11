import { describe, expect, it } from 'vitest';
import { atDistance, crater, ejectaFlightTime } from './eiep';

// Oracle values from scripts/eiep_reference.py (itself validated against Collins et al. 2005 Table 6).
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('EIEP port matches the Python reference', () => {
  it('Table 6 column 3 (18 km, 20 km/s, 45°)', () => {
    const c = crater({ diameterM: 18e3, densityKgM3: 2700, speedMs: 20e3, angleDeg: 45, targetDensityKgM3: 2750 });
    expect(rel(c.energyJ, 1.6489591520162106e24)).toBeLessThan(1e-12);
    expect(c.finalDiameterKm).toBeCloseTo(185.61862224011466, 9);
    expect(c.fireballRadiusKm).toBeCloseTo(236.28344532074357, 9);
    expect(c.magnitude).toBeCloseTo(10.35553063128706, 12);
    const a = atDistance(c, 200);
    expect(a.ejectaArrivalS).toBeCloseTo(205.64754236028517, 6);
    expect(a.blastArrivalS).toBeCloseTo(606.060606060606, 9);
    expect(rel(a.ejectaThicknessM, 117.30141411824013)).toBeLessThan(1e-9);
    expect(rel(a.overpressureBar, 131.2828866732349)).toBeLessThan(1e-9);
  });

  it('nominal Chicxulub (13 km, 2630 kg/m³, 20 km/s, 60°, sedimentary target)', () => {
    const c = crater({ diameterM: 13e3, densityKgM3: 2630, speedMs: 20e3, angleDeg: 60, targetDensityKgM3: 2500 });
    expect(rel(c.energyJ, 6.050822642544573e23)).toBeLessThan(1e-12);
    expect(c.transientDiameterKm).toBeCloseTo(86.00218954759117, 9);
    const cases: [number, number, number, number, number][] = [
      // r_km, M_eff, ejecta m, overpressure bar, wind m/s
      [50, 8.873815663667779, 3907.599065162716, 1459.4815881138807, 9722.659971394407],
      [700, 5.3384539718810755, 1.4240521374499695, 3.768345417516163, 431.8827851711562],
      [3000, 4.289295435470102, 0.018090736412790354, 0.21340355825020554, 46.24985361345696],
      [10000, 3.421316718304742, 0.0004884498831453396, 0.03596565930025574, 8.349892578892765],
    ];
    for (const [r, M, ej, p, w] of cases) {
      const a = atDistance(c, r);
      expect(a.seismicMagnitude).toBeCloseTo(M, 9);
      expect(rel(a.ejectaThicknessM, ej)).toBeLessThan(1e-9);
      expect(rel(a.overpressureBar, p)).toBeLessThan(1e-9);
      expect(rel(a.windMs, w)).toBeLessThan(1e-9);
    }
    expect(atDistance(c, 3000).thermalMJm2).toBe(0); // fireball below the horizon
  });

  it('ejecta flight times match the research table', () => {
    // docs/research/timeline.md §2: 200 km → 3.4 min, 1000 km → 8.2 min, 3000 km → 17 min, 10 000 km → 61 min
    expect(ejectaFlightTime(200).seconds / 60).toBeCloseTo(3.4, 1);
    expect(ejectaFlightTime(1000).seconds / 60).toBeCloseTo(8.2, 1);
    expect(ejectaFlightTime(3000).seconds / 60).toBeCloseTo(17, 0);
    expect(ejectaFlightTime(10000).seconds / 60).toBeCloseTo(61, 0);
  });

  it('seismic magnitude is continuous at 700 km (eq. 41c erratum)', () => {
    const c = crater({ diameterM: 13e3, densityKgM3: 2630, speedMs: 20e3, angleDeg: 60, targetDensityKgM3: 2500 });
    expect(Math.abs(atDistance(c, 699.9).seismicMagnitude - atDistance(c, 700.1).seismicMagnitude)).toBeLessThan(0.25);
  });
});
