import { describe, expect, it } from 'vitest';
import { IMPACT, SKY } from '../config';
import { EVENTS } from './events';
import { SOURCES } from './sources';

describe('bibliography', () => {
  it('every entry has a citation and a link', () => {
    for (const [k, s] of Object.entries(SOURCES)) {
      expect(s.short, k).toBeTruthy();
      expect(s.url, k).toMatch(/^https?:\/\//);
    }
  });
  it('every source cited by the timeline exists', () => {
    for (const e of EVENTS) for (const k of e.sources) expect(SOURCES[k], `${e.id} cites ${k}`).toBeDefined();
  });
  it('every source cited by the scenario constants exists', () => {
    for (const fact of [...Object.values(IMPACT), ...Object.values(SKY)]) {
      for (const k of (fact as { sources?: string[] }).sources ?? []) expect(SOURCES[k], k).toBeDefined();
    }
  });
});
