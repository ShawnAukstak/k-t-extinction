/**
 * Where the Sun is overhead at simulation time t (the subsolar point), in the paleo-globe frame.
 * Uses the chosen time of day and season at impact (config SKY) and a 66 Ma day length.
 */
import { Vector3 } from 'three';
import { IMPACT, SKY, YEAR_S } from '../config';
import { DEG, latLonToVec, wrapLon, type LatLon } from './geo';

const DAY_S = SKY.dayLengthH.value * 3600;
const OBLIQUITY = SKY.obliquityDeg.value * DEG;
/** Sun's ecliptic longitude at impact, chosen in (0°, 90°) — after the March equinox. */
const L0 = Math.asin(Math.sin(SKY.declinationDeg.value * DEG) / Math.sin(OBLIQUITY));
/** Subsolar longitude at impact: at 10:00 local time the Sun is 30° east of the site's meridian. */
const SUBSOLAR_LON0 = IMPACT.site.value.lon + (12 - SKY.localSolarTimeH.value) * 15;

export function subsolarPoint(t: number): LatLon {
  const L = L0 + (2 * Math.PI * t) / YEAR_S;
  const lat = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L)) / DEG;
  const lon = wrapLon(SUBSOLAR_LON0 - 360 * ((t / DAY_S) % 1));
  return { lat, lon };
}

/** Unit vector from Earth's centre toward the Sun. */
export function sunDirection(t: number, out = new Vector3()): Vector3 {
  const p = subsolarPoint(t);
  return latLonToVec(p.lat, p.lon, 1, out);
}

/** Local solar time (hours, 0–24) at a longitude, at time t. */
export function localSolarTime(lon: number, t: number): number {
  const sub = subsolarPoint(t).lon;
  return ((((lon - sub) / 15 + 12) % 24) + 24) % 24;
}

export const DAY_LENGTH_S = DAY_S;
