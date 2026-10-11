/**
 * "What happened here?" — the sequence of effects at one point on the 66 Ma globe, assembled from
 * the scaling laws (Collins et al. 2005) and the baked model outputs (tsunami, dust, impact winter).
 * Pure: all data comes in through `LocalData`, so it is unit-testable without a GPU.
 */
import type { Confidence } from '../config';
import { atDistance, type CraterResult } from '../physics/eiep';
import { bearing, centralAngle, type LatLon } from './geo';

export interface LocalRow {
  id: string;
  label: string;
  /** Seconds after impact when it starts here (null = doesn't happen here / not applicable). */
  arrivalS: number | null;
  /** Human-readable magnitude at this place. */
  value: string;
  confidence: Confidence;
  sources: string[];
}

export interface LocalHistory {
  point: LatLon;
  distanceKm: number;
  /** Direction from the crater to this point, degrees clockwise from north. */
  bearingFromCrater: number;
  elevationM: number | null;
  ocean: boolean;
  rows: LocalRow[];
}

export interface LocalData {
  crater: CraterResult;
  craterSite: LatLon;
  craterRimKm: number;
  elevationAt?: (lat: number, lon: number) => number | null;
  /** Tsunami arrival (s) and max height (m) here; null when the data isn't loaded. */
  tsunamiAt?: (lat: number, lon: number) => { arrivalS: number; heightM: number } | null;
  /** First time the dust/ejecta cloud column here exceeds ~1 kg/m² (s). */
  dustArrivalAt?: (angleRad: number) => number | null;
  /** Impact-winter series here: times (s), sunlight fraction, temperature (°C). */
  winterAt?: (lat: number, lon: number) => { times: number[]; light: number[]; tempC: number[] } | null;
}

const YEAR = 365.25 * 86400;

function fmtLength(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`;
  if (m >= 1) return `${m.toFixed(m >= 10 ? 0 : 1)} m`;
  if (m >= 0.01) return `${(m * 100).toFixed(m >= 0.1 ? 0 : 1)} cm`;
  return `${(m * 1000).toFixed(1)} mm`;
}

function fmtPressure(bar: number): string {
  if (bar >= 1) return `${bar.toFixed(bar >= 10 ? 0 : 1)} bar overpressure (normal air is 1 bar)`;
  return `${(bar * 1000).toFixed(0)} mbar overpressure`;
}

/** EIEP Table 1: deciduous trees ignite at 0.25 MJ/m² for 1 Mt, scaling with E^(1/6). */
function treeIgnitionMJm2(energyMt: number): number {
  return 0.25 * energyMt ** (1 / 6);
}

export function localHistory(point: LatLon, d: LocalData): LocalHistory {
  const ang = centralAngle(d.craterSite, point);
  const distanceKm = ang * 6371;
  const elevationM = d.elevationAt?.(point.lat, point.lon) ?? null;
  const ocean = elevationM !== null ? elevationM < 0 : false;
  const rows: LocalRow[] = [];
  const inCrater = distanceKm < d.craterRimKm;

  if (inCrater) {
    rows.push({
      id: 'crater', label: 'Inside the crater', arrivalS: 0,
      value: 'Vaporised and excavated within seconds; the floor becomes a sea of impact melt',
      confidence: 'known', sources: ['collins2020', 'gulick2019'],
    });
  }
  const r = Math.max(distanceKm, 1);
  const fx = atDistance(d.crater, r);

  if (!inCrater && fx.fireballVisible) {
    rows.push({
      id: 'fireball', label: 'Fireball heat', arrivalS: d.crater.timeToMaxRadiationS,
      value: `${fx.thermalMJm2 >= 1 ? fx.thermalMJm2.toFixed(0) : fx.thermalMJm2.toFixed(2)} MJ/m² of radiant heat` +
        (fx.thermalMJm2 >= treeIgnitionMJm2(d.crater.energyMt) ? ' — enough to set trees alight' : ' — below the ignition point of trees'),
      confidence: 'model', sources: ['collins2005'],
    });
  } else if (!inCrater) {
    rows.push({
      id: 'fireball', label: 'Fireball', arrivalS: null,
      value: 'Below the horizon — no direct heat from the fireball here',
      confidence: 'model', sources: ['collins2005'],
    });
  }

  rows.push({
    id: 'seismic', label: 'Earthquake', arrivalS: fx.seismicArrivalS,
    value: `Shaking like a magnitude ${fx.seismicMagnitude.toFixed(1)} quake by the scaling law` +
      (distanceKm > 1000 ? '; deposits such as the Tanis surge suggest far stronger, longer shaking' : ''),
    confidence: 'contested', sources: ['collins2005', 'depalma2019', 'bermudez2026'],
  });

  if (!inCrater) {
    rows.push({
      id: 'ejecta', label: 'Falling ejecta', arrivalS: fx.ejectaArrivalS,
      value: `${fmtLength(fx.ejectaThicknessM)} of debris (scaling law, ±2×)`,
      confidence: 'model', sources: ['collins2005', 'schulte2010'],
    });
  }

  const dustS = d.dustArrivalAt?.(ang);
  if (dustS != null) {
    rows.push({
      id: 'dust', label: 'Dust cloud overhead', arrivalS: dustS,
      value: 'Daylight fades under a cloud of rock dust and soot',
      confidence: 'model', sources: ['artemieva2020', 'morgan2022'],
    });
  }

  rows.push({
    id: 'blast', label: 'Air blast', arrivalS: fx.blastArrivalS,
    value: `${fmtPressure(fx.overpressureBar)}, winds ${fx.windMs >= 1000 ? (fx.windMs / 1000).toFixed(1) + ' km/s' : Math.round(fx.windMs * 3.6) + ' km/h'} (scaling law, may be 2–5× too high)`,
    confidence: 'contested', sources: ['collins2005'],
  });

  if (ocean) {
    const ts = d.tsunamiAt?.(point.lat, point.lon);
    if (ts) {
      rows.push({
        id: 'tsunami', label: 'Tsunami', arrivalS: ts.arrivalS,
        value: `Waves up to ${fmtLength(ts.heightM)} high in the open water here`,
        confidence: 'model', sources: ['range2022'],
      });
    }
  }

  const w = d.winterAt?.(point.lat, point.lon);
  if (w && w.times.length > 2) {
    // Time spent below 10 % light, weighting each keyframe by the span it represents (keyframes are
    // monthly for 3 years, then sparser).
    let darkS = 0;
    for (let i = 1; i < w.times.length; i++) {
      if (w.light[i] >= 0.1) continue;
      const prev = w.times[i - 1], next = w.times[Math.min(i + 1, w.times.length - 1)];
      darkS += (next - prev) / 2;
    }
    let minLight = 1, minLightT = 0, minT = Infinity, minTT = 0;
    for (let i = 1; i < w.times.length; i++) {
      if (w.light[i] < minLight) { minLight = w.light[i]; minLightT = w.times[i]; }
      if (w.tempC[i] < minT) { minT = w.tempC[i]; minTT = w.times[i]; }
    }
    const dark = darkS >= YEAR ? `${(darkS / YEAR).toFixed(1)} years` : `${Math.max(1, Math.round(darkS / (YEAR / 12)))} months`;
    rows.push({
      id: 'darkness', label: 'Darkest', arrivalS: minLightT,
      value: minLight < 0.1
        ? `Sunlight below 10 % of normal for about ${dark}`
        : `Sunlight down to ${Math.round(minLight * 100)} % of normal`,
      confidence: 'contested', sources: ['tabor2020', 'bardeen2017'],
    });
    rows.push({
      id: 'cold', label: 'Coldest', arrivalS: minTT,
      value: `${minT.toFixed(0)} °C, ${Math.abs(minT - w.tempC[0]).toFixed(0)} °C colder than before the impact`,
      confidence: 'contested', sources: ['tabor2020', 'brugger2017'],
    });
  }

  rows.sort((a, b) => (a.arrivalS ?? Infinity) - (b.arrivalS ?? Infinity));
  return { point, distanceKm, bearingFromCrater: bearing(d.craterSite, point), elevationM, ocean, rows };
}
