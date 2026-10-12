/**
 * The non-linear timeline: a list of segments, each mapping a slice of the scrubber bar to a range
 * of simulation time. Canonical simulation time `t` is float64 seconds since first contact
 * (negative = before impact). See docs/tech/ux-timeline-camera-sharing.md §1.
 *
 * Within a segment the bar position maps to time linearly, logarithmically, or as an inverse
 * hyperbolic sine (log-like on both sides of zero with a linear core). Playback moves the playhead at
 * a constant speed along each segment, so log and asinh segments ease through sim time: the event
 * slows down smoothly into the impact and accelerates through the aftermath.
 */
import { YEAR_S } from '../config';

export type SegmentScale =
  | 'linear'
  /** log of |t| — for segments wholly before or wholly after t = 0. */
  | 'log'
  /** asinh(t / core) — spans t = 0: slowest (about real time) within ±core of it, log-like beyond. */
  | 'asinh';

export interface Segment {
  id: string;
  label: string;
  /** Start and end, seconds since impact. */
  t0: number;
  t1: number;
  scale: SegmentScale;
  /** Fraction of the bar this segment occupies; all widths sum to 1. */
  width: number;
  /** Wall-clock seconds to play the whole segment at 1× speed. */
  playSeconds: number;
  /** asinh scale: the half-width of the slow core, seconds. */
  core?: number;
}

const MIN = 60, HOUR = 3600, DAY = 86_400;

export const SEGMENTS: readonly Segment[] = [
  { id: 'approach', label: 'Approach',       t0: -HOUR,    t1: -MIN,        scale: 'log',    width: 0.08, playSeconds: 12 },
  // Eases from the approach's ~20× down to ~1.4× at the impact itself and back up to the crater's 20×,
  // so the final minute plays in ~10 s with only the entry and impact in near-real time.
  { id: 'impact',   label: 'Impact',         t0: -MIN,     t1: MIN,         scale: 'asinh',  width: 0.14, playSeconds: 20, core: 4 },
  { id: 'crater',   label: 'Crater',   t0: MIN,      t1: 15 * MIN,    scale: 'linear', width: 0.10, playSeconds: 42 },
  { id: 'hours',    label: 'First day',      t0: 15 * MIN, t1: DAY,         scale: 'log',    width: 0.18, playSeconds: 45 },
  { id: 'weeks',    label: 'First weeks',    t0: DAY,      t1: 60 * DAY,    scale: 'log',    width: 0.10, playSeconds: 20 },
  { id: 'winter',   label: 'Impact winter',  t0: 60 * DAY, t1: 30 * YEAR_S, scale: 'log',    width: 0.20, playSeconds: 35 },
  { id: 'recovery', label: 'Recovery',       t0: 30 * YEAR_S, t1: 1e6 * YEAR_S, scale: 'log', width: 0.20, playSeconds: 30 },
];

export const T_START = SEGMENTS[0].t0;
export const T_END = SEGMENTS[SEGMENTS.length - 1].t1;

/** Bar position where each segment starts. */
const STARTS: number[] = (() => {
  const s: number[] = [];
  let u = 0;
  for (const seg of SEGMENTS) {
    s.push(u);
    u += seg.width;
  }
  return s;
})();

export function segmentStart(i: number): number {
  return STARTS[i];
}

export function clampTime(t: number): number {
  return Math.min(T_END, Math.max(T_START, t));
}

export function segmentIndexAt(t: number): number {
  const tc = clampTime(t);
  for (let i = 0; i < SEGMENTS.length; i++) if (tc < SEGMENTS[i].t1) return i;
  return SEGMENTS.length - 1;
}

/** Segment-local fraction f ∈ [0, 1] → time. */
export function localToTime(seg: Segment, f: number): number {
  const ff = Math.min(1, Math.max(0, f));
  if (seg.scale === 'linear') return seg.t0 + (seg.t1 - seg.t0) * ff;
  if (seg.scale === 'asinh') {
    const c = seg.core ?? 1, a = Math.asinh(seg.t0 / c), b = Math.asinh(seg.t1 / c);
    return c * Math.sinh(a + (b - a) * ff);
  }
  // log: both ends share a sign
  const sign = seg.t0 < 0 ? -1 : 1;
  const a = Math.abs(seg.t0), b = Math.abs(seg.t1);
  return sign * a * Math.pow(b / a, ff);
}

/** Time → segment-local fraction within the given segment. */
export function timeToLocal(seg: Segment, t: number): number {
  const tc = Math.min(Math.max(t, Math.min(seg.t0, seg.t1)), Math.max(seg.t0, seg.t1));
  if (seg.scale === 'linear') return (tc - seg.t0) / (seg.t1 - seg.t0);
  if (seg.scale === 'asinh') {
    const c = seg.core ?? 1, a = Math.asinh(seg.t0 / c), b = Math.asinh(seg.t1 / c);
    return (Math.asinh(tc / c) - a) / (b - a);
  }
  const a = Math.abs(seg.t0), b = Math.abs(seg.t1);
  return Math.log(Math.abs(tc) / a) / Math.log(b / a);
}

/** Bar position u ∈ [0, 1] → time. */
export function barToTime(u: number): number {
  const uc = Math.min(1, Math.max(0, u));
  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i];
    const end = STARTS[i] + seg.width;
    if (uc <= end || i === SEGMENTS.length - 1) return localToTime(seg, (uc - STARTS[i]) / seg.width);
  }
  return T_END;
}

/** Time → bar position u ∈ [0, 1]. */
export function timeToBar(t: number): number {
  const i = segmentIndexAt(t);
  const seg = SEGMENTS[i];
  return STARTS[i] + seg.width * timeToLocal(seg, t);
}

/**
 * Advance time by `dtWall` wall-clock seconds at `speed`× the default pacing. Crosses segment
 * boundaries, carrying the remainder into the next segment's pacing. Returns the new time.
 */
export function advance(t: number, dtWall: number, speed: number): number {
  let remaining = dtWall * speed; // wall seconds at 1×
  let tt = clampTime(t);
  if (remaining === 0) return tt;
  const forward = remaining > 0;
  remaining = Math.abs(remaining);
  let i = segmentIndexAt(tt);
  // When exactly on a boundary going backwards, step into the previous segment.
  if (!forward && i > 0 && tt <= SEGMENTS[i].t0) i--;
  for (let guard = 0; guard < SEGMENTS.length + 1 && remaining > 0; guard++) {
    const seg = SEGMENTS[i];
    const f = timeToLocal(seg, tt);
    const df = remaining / seg.playSeconds;
    if (forward) {
      if (f + df < 1 || i === SEGMENTS.length - 1) return localToTime(seg, Math.min(1, f + df));
      remaining -= (1 - f) * seg.playSeconds;
      i++;
      tt = SEGMENTS[i].t0;
    } else {
      if (f - df > 0 || i === 0) return localToTime(seg, Math.max(0, f - df));
      remaining -= f * seg.playSeconds;
      i--;
      tt = SEGMENTS[i].t1;
    }
  }
  return tt;
}

/** Sim seconds that pass per wall second at time t and speed 1 (for the "×N" readout). */
export function rateAt(t: number): number {
  const seg = SEGMENTS[segmentIndexAt(t)];
  if (seg.scale === 'linear') return (seg.t1 - seg.t0) / seg.playSeconds;
  if (seg.scale === 'asinh') {
    // dt/df = c·cosh(asinh(t/c))·(b − a) = √(c² + t²)·(b − a)
    const c = seg.core ?? 1, tc = clampTime(t);
    return (Math.hypot(c, tc) * (Math.asinh(seg.t1 / c) - Math.asinh(seg.t0 / c))) / seg.playSeconds;
  }
  const a = Math.abs(seg.t0), b = Math.abs(seg.t1);
  // |dt/df| = |t|·|ln(b/a)| (b < a before the impact, where time runs toward zero)
  return (Math.abs(clampTime(t)) * Math.abs(Math.log(b / a))) / seg.playSeconds;
}

// ── formatting ────────────────────────────────────────────────────────────────

function pad(n: number, w = 2): string {
  return String(Math.floor(n)).padStart(w, '0');
}

/** Clock-style relative time for the readout, e.g. "T−00:59:12", "T+00:00:12.4", "T+3 h 12 min". */
export function formatRelative(t: number): string {
  const sign = t < 0 ? '−' : '+';
  const a = Math.abs(t);
  if (a < 15 * MIN) {
    const m = Math.floor(a / 60);
    const s = a - m * 60;
    const tenths = Math.floor((s % 1) * 10);
    return `T${sign}${pad(m)}:${pad(s)}.${tenths}`;
  }
  if (a < HOUR) return `T${sign}${Math.floor(a / 60)} min`;
  if (a < DAY) {
    const h = Math.floor(a / HOUR);
    const m = Math.floor((a - h * HOUR) / 60);
    return `T${sign}${h} h ${pad(m)} min`;
  }
  if (a < 60 * DAY) {
    const d = a / DAY;
    return `T${sign}${d < 10 ? d.toFixed(1) : Math.floor(d)} days`;
  }
  if (a < 2 * YEAR_S) return `T${sign}${Math.floor(a / (YEAR_S / 12))} months`;
  const y = a / YEAR_S;
  if (y < 100) return `T${sign}${y.toFixed(1)} years`;
  if (y < 10_000) return `T${sign}${Math.round(y).toLocaleString('en-US')} years`;
  return `T${sign}${(Math.round(y / 1000) * 1000).toLocaleString('en-US')} years`;
}

/** Absolute age for the subtitle, e.g. "66,040,000 years ago". */
export function formatAge(t: number, impactAgeMa: number): string {
  const yearsAgo = impactAgeMa * 1e6 - t / YEAR_S;
  // Before ~1 kyr after the impact the change is invisible at this precision.
  return `${(Math.round(yearsAgo / 1000) * 1000).toLocaleString('en-US')} years ago`;
}

/** Human rate, e.g. "real time", "×28", "1 h / s", "3 yr / s". */
export function formatRate(simPerWall: number): string {
  const r = Math.abs(simPerWall);
  if (r < 0.95) return `${r.toFixed(2)}× (slow motion)`;
  if (r < 1.05) return 'real time';
  if (r < 2.95) return `×${r.toFixed(1)}`;
  if (r < 120) return `×${Math.round(r)}`;
  if (r < 0.95 * HOUR) return `${Math.round(r / 60)} min / s`;
  if (r < 0.95 * DAY) return `${Math.round(r / HOUR)} h / s`;
  if (r < 45 * DAY) return `${Math.round(r / DAY)} days / s`;
  if (r < 2 * YEAR_S) return `${Math.round(r / (YEAR_S / 12))} months / s`;
  const y = r / YEAR_S;
  return y < 1000 ? `${Math.round(y)} yr / s` : `${Math.round(y / 1000).toLocaleString('en-US')} kyr / s`;
}
