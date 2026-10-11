import { describe, expect, it } from 'vitest';
import {
  SEGMENTS, T_END, T_START, advance, barToTime, formatAge, formatRate, formatRelative, rateAt,
  segmentIndexAt, timeToBar,
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
  it('plays the Impact minute in real time', () => {
    expect(advance(0, 1, 1)).toBeCloseTo(1, 9);
    expect(rateAt(10)).toBeCloseTo(1, 9);
  });
  it('crosses segment boundaries, carrying the remainder', () => {
    const impact = SEGMENTS.find((s) => s.id === 'impact')!;
    const crater = SEGMENTS.find((s) => s.id === 'crater')!;
    // 2 s before the end of Impact, advance 5 wall seconds: 2 s in Impact + 3 s of Crater pacing
    const t = advance(impact.t1 - 2, 5, 1);
    const craterRate = (crater.t1 - crater.t0) / crater.playSeconds;
    expect(t).toBeCloseTo(crater.t0 + 3 * craterRate, 6);
  });
  it('runs backwards with negative speed and stops at the ends', () => {
    expect(advance(5, 2, -1)).toBeCloseTo(3, 9);
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
    expect(formatRate(28)).toBe('×28');
    expect(formatRate(3600)).toBe('1 h / s');
    expect(formatRate(3 * YEAR_S)).toBe('3 yr / s');
  });
});
