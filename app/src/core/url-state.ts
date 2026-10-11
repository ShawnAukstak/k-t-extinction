/**
 * Deep links. Every view is a URL hash, so static hosting needs no routing:
 *
 *   #t=47.3&c=25.11,-71.58,350000,0,30&m=free&s=1&p=1&v=1
 *
 *   t  sim time, seconds since impact (float; e-notation allowed)
 *   c  camera: target lat, target lon, range (m), heading (deg), tilt (deg; 0 = looking straight down)
 *   m  camera mode: cine | fixed | free
 *   s  speed multiplier
 *   p  1 = paused
 *   k  curated camera preset id (overrides c)
 *   v  schema version
 *
 * Parsing is forgiving: unknown keys are ignored, bad values fall back to defaults.
 */

export type CameraMode = 'cine' | 'fixed' | 'free';

export interface CameraPose {
  lat: number;
  lon: number;
  /** Distance from the camera to the target point, metres. */
  range: number;
  /** Degrees clockwise from north that the camera faces. */
  heading: number;
  /** Degrees from straight down (0) toward the horizon (90). */
  tilt: number;
}

export interface ViewState {
  t?: number;
  camera?: CameraPose;
  mode?: CameraMode;
  speed?: number;
  paused?: boolean;
  preset?: string;
}

export const SCHEMA_VERSION = 1;

function num(s: string | undefined): number | undefined {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseHash(hash: string): ViewState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const out: ViewState = {};

  const t = num(params.get('t') ?? undefined);
  if (t !== undefined) out.t = t;

  const c = params.get('c');
  if (c) {
    const parts = c.split(',').map((p) => num(p));
    const [lat, lon, range, heading = 0, tilt = 0] = parts;
    if (lat !== undefined && lon !== undefined && range !== undefined && range > 0 && Math.abs(lat) <= 90) {
      out.camera = { lat, lon, range, heading: heading ?? 0, tilt: Math.min(89, Math.max(0, tilt ?? 0)) };
    }
  }

  const m = params.get('m');
  if (m === 'cine' || m === 'fixed' || m === 'free') out.mode = m;

  const s = num(params.get('s') ?? undefined);
  if (s !== undefined && s !== 0 && Math.abs(s) <= 1000) out.speed = s;

  const p = params.get('p');
  if (p !== null) out.paused = p === '1' || p === 'true';

  const k = params.get('k');
  if (k && /^[a-z0-9-]{1,40}$/.test(k)) out.preset = k;

  return out;
}

/** Round to a sensible number of significant figures for short, readable URLs. */
function fmt(n: number, decimals: number): string {
  return Number(n.toFixed(decimals)).toString();
}

function fmtTime(t: number): string {
  const a = Math.abs(t);
  if (a < 1000) return fmt(t, 1);
  if (a < 1e7) return fmt(t, 0);
  return t.toExponential(4).replace('e+', 'e');
}

export function formatHash(v: ViewState): string {
  const parts: string[] = [];
  if (v.t !== undefined) parts.push(`t=${fmtTime(v.t)}`);
  if (v.preset) parts.push(`k=${v.preset}`);
  else if (v.camera) {
    const c = v.camera;
    const lonWrapped = ((((c.lon + 180) % 360) + 360) % 360) - 180;
    const heading = ((c.heading % 360) + 360) % 360;
    parts.push(`c=${[fmt(c.lat, 4), fmt(lonWrapped, 4), fmt(c.range, 0), fmt(heading, 1), fmt(c.tilt, 1)].join(',')}`);
  }
  if (v.mode) parts.push(`m=${v.mode}`);
  if (v.speed !== undefined && v.speed !== 1) parts.push(`s=${fmt(v.speed, 3)}`);
  if (v.paused) parts.push('p=1');
  parts.push(`v=${SCHEMA_VERSION}`);
  return '#' + parts.join('&');
}
