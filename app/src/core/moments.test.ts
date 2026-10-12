import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MOMENTS, validateMoments } from './moments';

describe('moments', () => {
  it('all parse, with a time, and known places and events', () => {
    expect(MOMENTS.length).toBeGreaterThan(8);
    expect(MOMENTS[0].id).toBe('start');
    expect(MOMENTS[0].state).toMatchObject({ t: -3600, mode: 'cine' });
    expect(MOMENTS[0].state.paused).toBeUndefined(); // the start plays
  });
  it('each has its thumbnail (tools/moment-thumbs.mjs)', () => {
    for (const m of MOMENTS) {
      const f = fileURLToPath(new URL(`../../public/moments/${m.id}.jpg`, import.meta.url));
      expect(existsSync(f), `${m.id}.jpg`).toBe(true);
    }
  });
  it('rejects bad entries', () => {
    expect(() => validateMoments({ moments: [{ id: 'x', title: 'X', blurb: 'x', view: 'c=1,2,3' }] })).toThrow(/time/);
    expect(() => validateMoments({ moments: [{ id: 'x', title: 'X', blurb: 'x', view: 't=1&k=nowhere' }] })).toThrow(/place/);
    expect(() => validateMoments({ moments: [{ id: 'x', title: 'X', blurb: 'x', view: 't=1', event: 'nope' }] })).toThrow(/event/);
    expect(() => validateMoments({ moments: [{ id: 'x', title: 'X', blurb: 'x', view: 't=1', action: 'animals' }] })).toThrow(/place/);
  });
});
