import { describe, expect, it } from 'vitest';
import {
  SEGMENTS, T_END, T_START, advance, barToTime, formatAge, formatRate, formatRelative, rateAt,
  segmentIndexAt, timeToBar, timeToLocal,
} from './timeline';
import { YEAR_S } from '../config';

describe('segments', () => {
  it('cover the bar exactly and are contiguous in time', () => {
    expect(SEGMENTS.reduce((a, s) => a + s.width, 0)).toBeCloseTo(1, 12);
    for (let i = 1; i < SEGMENTS.length; i++) expect(SEGMENTS[i].t0).toBe(SEGMENTS[i - 1].t1);
  });
  it('log segments never span t = 0', () => {
    for (const s of SEGMENTS) if (s.scale === 'log') expect(Math.sign(s.t0)).toBe(Math.sign(s.t1));
  });
});

describe('bar <-> time', () => {
  it('maps the ends', () => {
    expect(barToTime(0)).toBe(T_START);
    expect(barToTime(1)).toBeCloseTo(T_END, -3);
  });
  it('round-trips across the whole range', () => {
    for (let u = 0; u <= 1; u += 0.0137) expect(timeToBar(barToTime(u))).toBeCloseTo(u, 9);
  });
  it('is monotonic', () => {
    let prev = -Infinity;
    for (let u = 0; u <= 1; u += 0.001) {
      const t = barToTime(u);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
  it('places impact inside the Impact segment', () => {
    const u = timeToBar(0);
    const i = SEGMENTS.findIndex((s) => s.id === 'impact');
    expect(segmentIndexAt(0)).toBe(i);
    expect(u).toBeGreaterThan(0.08);
    expect(u).toBeLessThan(0.22);
  });
});

describe('advance', () => {
  it('eases into the impact without a sudden slowdown, and plays the final minute in ~10 s', () => {
    // Close to real time at the impact itself…
    expect(rateAt(0)).toBeGreaterThan(1);
    expect(rateAt(0)).toBeLessThan(2);
    // …and no jump in pace where the Impact segment meets its neighbours (within 5 %).
    for (let i = 1; i < 3; i++) {
      const b = SEGMENTS[i].t0;
      expect(rateAt(b - 1e-6) / rateAt(b), SEGMENTS[i].id).toBeCloseTo(1, 1);
    }
    const impact = SEGMENTS.find((s) => s.id === 'impact')!;
    const wall = (t0: number, t1: number) => (timeToLocal(impact, t1) - timeToLocal(impact, t0)) * impact.playSeconds;
    expect(wall(-60, 0)).toBeGreaterThan(7);
    expect(wall(-60, 0)).toBeLessThan(13);
    expect(wall(-5, 0)).toBeGreaterThan(2); // the entry still gets a couple of seconds
    // advance() and rateAt() agree.
    expect((advance(0, 0.01, 1) - 0) / 0.01).toBeCloseTo(rateAt(0), 1);
  });
  it('crosses segment boundaries, carrying the remainder', () => {
    const impact = SEGMENTS.find((s) => s.id === 'impact')!;
    const crater = SEGMENTS.find((s) => s.id === 'crater')!;
    // 2 s before the end of Impact, advance 5 wall seconds: the rest of Impact, then Crater pacing
    const left = (1 - timeToLocal(impact, impact.t1 - 2)) * impact.playSeconds;
    const t = advance(impact.t1 - 2, 5, 1);
    const craterRate = (crater.t1 - crater.t0) / crater.playSeconds;
    expect(t).toBeCloseTo(crater.t0 + (5 - left) * craterRate, 6);
  });
  it('runs backwards with negative speed and stops at the ends', () => {
    const impact = SEGMENTS.find((s) => s.id === 'impact')!;
    expect(timeToLocal(impact, advance(5, 2, -1))).toBeCloseTo(timeToLocal(impact, 5) - 2 / impact.playSeconds, 9);
    expect(advance(T_START + 1, 1000, -1)).toBe(T_START);
    expect(advance(T_END - 1, 1000, 1)).toBeCloseTo(T_END, -3);
  });
  it('plays the whole timeline in the sum of segment durations', () => {
    const total = SEGMENTS.reduce((a, s) => a + s.playSeconds, 0);
    let t = T_START;
    for (let i = 0; i < total * 10; i++) t = advance(t, 0.1, 1);
    expect(t).toBeCloseTo(T_END, -3);
    expect(advance(T_START, total - 1, 1)).toBeLessThan(T_END);
  });
});

describe('formatting', () => {
  it('formats relative times by magnitude', () => {
    expect(formatRelative(-59.95)).toBe('T−00:59.9');
    expect(formatRelative(12.43)).toBe('T+00:12.4');
    expect(formatRelative(3 * 3600 + 12 * 60)).toBe('T+3 h 12 min');
    expect(formatRelative(5 * 86400)).toBe('T+5.0 days');
    expect(formatRelative(3.25 * YEAR_S)).toBe('T+3.3 years');
    expect(formatRelative(180_000 * YEAR_S)).toBe('T+180,000 years');
  });
  it('formats the absolute age', () => {
    expect(formatAge(0, 66.04)).toBe('66,040,000 years ago');
    expect(formatAge(1e6 * YEAR_S, 66.04)).toBe('65,040,000 years ago');
  });
  it('formats rates', () => {
    expect(formatRate(1)).toBe('real time');
    expect(formatRate(1.36)).toBe('×1.4');
    expect(formatRate(28)).toBe('×28');
    expect(formatRate(3600)).toBe('1 h / s');
    expect(formatRate(3 * YEAR_S)).toBe('3 yr / s');
  });
});
