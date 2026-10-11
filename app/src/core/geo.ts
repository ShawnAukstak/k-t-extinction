/**
 * Spherical geodesy on the paleo-globe.
 *
 * World frame (metres, Earth-centred, Earth-fixed): +Y is the north pole, +Z is (0°N, 0°E),
 * +X is (0°N, 90°E). Latitude/longitude are degrees in the PALEOMAP 65 Ma frame.
 */
import { Vector3 } from 'three';
import { EARTH_RADIUS } from '../config';

export const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export function latLonToVec(lat: number, lon: number, radius = EARTH_RADIUS, out = new Vector3()): Vector3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  const c = Math.cos(la);
  return out.set(radius * c * Math.sin(lo), radius * Math.sin(la), radius * c * Math.cos(lo));
}

export function vecToLatLon(v: Vector3): LatLon {
  const r = v.length();
  return { lat: Math.asin(Math.max(-1, Math.min(1, v.y / r))) / DEG, lon: Math.atan2(v.x, v.z) / DEG };
}

/** Local East/North/Up unit vectors at a point. */
export function enuBasis(lat: number, lon: number): { e: Vector3; n: Vector3; u: Vector3 } {
  const la = lat * DEG;
  const lo = lon * DEG;
  const sla = Math.sin(la), cla = Math.cos(la), slo = Math.sin(lo), clo = Math.cos(lo);
  return {
    e: new Vector3(clo, 0, -slo),
    n: new Vector3(-sla * slo, cla, -sla * clo),
    u: new Vector3(cla * slo, sla, cla * clo),
  };
}

/** Central angle between two points, radians (haversine; stable for small angles). */
export function centralAngle(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle distance in metres. */
export function distance(a: LatLon, b: LatLon, radius = EARTH_RADIUS): number {
  return centralAngle(a, b) * radius;
}

/** Initial bearing from a to b, degrees clockwise from north in [0, 360). */
export function bearing(a: LatLon, b: LatLon): number {
  const la1 = a.lat * DEG, la2 = b.lat * DEG, dLon = (b.lon - a.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / DEG) % 360 + 360) % 360;
}

/** Point reached travelling `dist` metres from `a` on initial bearing `brg` degrees. */
export function destination(a: LatLon, brg: number, dist: number, radius = EARTH_RADIUS): LatLon {
  const d = dist / radius;
  const la1 = a.lat * DEG, lo1 = a.lon * DEG, th = brg * DEG;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(th));
  const lo2 = lo1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 / DEG, lon: (((lo2 / DEG) + 540) % 360) - 180 };
}

export function antipode(a: LatLon): LatLon {
  return { lat: -a.lat, lon: a.lon > 0 ? a.lon - 180 : a.lon + 180 };
}

/** Wrap a longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
