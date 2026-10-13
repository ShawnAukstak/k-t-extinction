import { describe, expect, it } from 'vitest';
import { frameToPose, poseToFrame } from './globe-controls';

describe('camera poses', () => {
  it('round-trips pose → frame → pose', () => {
    for (const p of [
      { lat: 25.1, lon: -71.6, range: 900_000, heading: 30, tilt: 60 },
      { lat: -40, lon: 120, range: 16_000_000, heading: 0, tilt: 0 },
      { lat: 10, lon: -80, range: 40_000_000, heading: 135, tilt: 0 }, // straight down, turned
      { lat: 60, lon: 10, range: 5_000, heading: 270, tilt: 80 },
    ]) {
      const f = poseToFrame(p);
      const q = frameToPose(f.position, f.quaternion);
      expect(q.lat).toBeCloseTo(p.lat, 6);
      expect(q.lon).toBeCloseTo(p.lon, 6);
      expect(q.range).toBeCloseTo(p.range, 0);
      expect(q.tilt).toBeCloseTo(p.tilt, 4);
      expect(q.heading).toBeCloseTo(p.heading, 6);
    }
  });
});
