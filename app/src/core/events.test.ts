import { describe, expect, it } from 'vitest';
import { currentMarker, EVENTS, MARKERS, nextMarker, prevMarker, validateEvents } from './events';
import { T_END, T_START } from './timeline';

describe('timeline events', () => {
  it('loads and validates data/curated/timeline.yaml', () => {
    expect(EVENTS.length).toBeGreaterThan(20);
    expect(MARKERS.length).toBeGreaterThan(8);
    for (const e of EVENTS) {
      expect(e.t).toBeGreaterThanOrEqual(T_START);
      expect(e.t).toBeLessThanOrEqual(T_END);
    }
  });
  it('is sorted and navigable', () => {
    expect(currentMarker(0)?.id).toBe('contact');
    expect(nextMarker(0)?.id).toBe('transient-cavity');
    expect(prevMarker(0)?.id).toBe('entry');
    expect(currentMarker(-30)?.id).toBe('final-minute');
    expect(currentMarker(T_START - 1)).toBeUndefined();
  });
  it('rejects malformed events', () => {
    expect(() => validateEvents({ events: [{ id: 'a', t: 0, title: 'x', detail: 'y', confidence: 'maybe', sources: ['s'] }] })).toThrow(/confidence/);
    expect(() => validateEvents({ events: [{ id: 'a', t: 0, title: 'x', detail: 'y', confidence: 'known', sources: [] }] })).toThrow(/source/);
  });
});
