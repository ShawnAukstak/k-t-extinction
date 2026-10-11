import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './url-state';

describe('url state', () => {
  it('round-trips a full view', () => {
    const v = { t: 47.3, camera: { lat: 25.1149, lon: -71.5823, range: 350000, heading: 45, tilt: 30 }, mode: 'free' as const, speed: 2, paused: true };
    const parsed = parseHash(formatHash(v));
    expect(parsed).toEqual(v);
  });
  it('keeps URLs short', () => {
    const h = formatHash({ t: 3.2e10, camera: { lat: 25.123456, lon: -71.987654, range: 1234567.89, heading: 359.99, tilt: 12.345 } });
    expect(h).toBe('#t=3.2000e10&c=25.1235,-71.9877,1234568,360,12.3&v=1');
    expect(h.length).toBeLessThan(80);
  });
  it('ignores garbage and clamps tilt', () => {
    expect(parseHash('#t=abc&c=1,2&m=nope&s=0&zzz=1')).toEqual({});
    expect(parseHash('#c=10,20,1000,0,120').camera?.tilt).toBe(89);
    expect(parseHash('#c=100,20,1000').camera).toBeUndefined();
  });
  it('round-trips the location query and scenario', () => {
    const v = parseHash(formatHash({ query: { lat: 48.712, lon: -81.3 }, scenario: 'so2' }));
    expect(v.query).toEqual({ lat: 48.712, lon: -81.3 });
    expect(v.scenario).toBe('so2');
    expect(formatHash({ scenario: 'soot' })).not.toContain('w=');
  });
  it('carries a readable name for the location', () => {
    const v = parseHash(formatHash({ query: { lat: 45.2, lon: 128.7 }, queryName: 'Tokyo, Japan' }));
    expect(v.queryName).toBe('Tokyo, Japan');
    expect(parseHash('#qn=Nowhere').queryName).toBeUndefined(); // needs q
  });
  it('wraps longitude when formatting', () => {
    expect(formatHash({ camera: { lat: 0, lon: 200, range: 10, heading: -90, tilt: 0 } })).toContain('c=0,-160,10,270,0');
  });
});
