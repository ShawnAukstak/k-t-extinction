import { describe, expect, it } from 'vitest';
import { antipode, bearing, destination, distance, enuBasis, latLonToVec, vecToLatLon, wrapLon } from './geo';

describe('geo', () => {
  it('round-trips lat/lon through vectors', () => {
    for (const [lat, lon] of [[0, 0], [25.11, -71.58], [-64.2, -56.6], [89.9, 179.9], [-45, -179.5]]) {
      const ll = vecToLatLon(latLonToVec(lat, lon));
      expect(ll.lat).toBeCloseTo(lat, 9);
      expect(ll.lon).toBeCloseTo(lon, 9);
    }
  });
  it('uses +Y north, +Z at (0,0), +X at (0,90E)', () => {
    const z = latLonToVec(0, 0, 1), x = latLonToVec(0, 90, 1), y = latLonToVec(90, 0, 1);
    expect(z.z).toBeCloseTo(1); expect(x.x).toBeCloseTo(1); expect(y.y).toBeCloseTo(1);
  });
  it('builds a right-handed ENU frame', () => {
    const { e, n, u } = enuBasis(30, -70);
    expect(e.clone().cross(n).distanceTo(u)).toBeLessThan(1e-12);
    expect(u.distanceTo(latLonToVec(30, -70, 1))).toBeLessThan(1e-12);
  });
  it('measures distances and bearings', () => {
    // a quarter of the equator
    expect(distance({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo((Math.PI / 2) * 6_371_000, 3);
    expect(bearing({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 9);
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 9);
    const a = { lat: 25.11, lon: -71.58 };
    const b = destination(a, 225, 3_000_000);
    expect(distance(a, b)).toBeCloseTo(3_000_000, 0);
    expect(bearing(a, b)).toBeCloseTo(225, 0);
  });
  it('wraps longitudes and finds antipodes', () => {
    expect(wrapLon(190)).toBeCloseTo(-170);
    expect(wrapLon(-190)).toBeCloseTo(170);
    expect(antipode({ lat: 25, lon: -71.6 })).toEqual({ lat: -25, lon: 108.4 });
  });
});
