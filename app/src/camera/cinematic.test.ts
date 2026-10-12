import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { enuBasis, latLonToVec } from '../core/geo';
import { Asteroid } from '../render/asteroid';
import { Cinematic } from './cinematic';

/**
 * Where north points on screen at the crater (the subject of every shot): project the crater and a point
 * 1 km north of it through a pinhole camera; degrees clockwise from straight up.
 */
function northOnScreen(cine: Cinematic, t: number, aspect: number): number {
  const f = cine.frame(t, aspect);
  const fwd = f.target.clone().sub(f.position).normalize();
  const right = new Vector3().crossVectors(fwd, f.up).normalize();
  const up = new Vector3().crossVectors(right, fwd);
  const { lat, lon } = IMPACT.site.value;
  const site = latLonToVec(lat, lon, EARTH_RADIUS);
  const screen = (p: Vector3) => { const q = p.clone().sub(f.position); const z = q.dot(fwd); return [q.dot(right) / z, q.dot(up) / z]; };
  const [x0, y0] = screen(site);
  const [x1, y1] = screen(site.clone().addScaledVector(enuBasis(lat, lon).n, 1000));
  return (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
}

describe('cinematic camera', () => {
  const cine = new Cinematic(new Asteroid());

  it('keeps north toward the top of the screen in every shot, so the map reads at first sight', () => {
    for (const t of [-3600, -1800, -900, -300, -120, -60, -45, -40, -30, -10, 0, 3, 15, 60, 600, 1800, 3600, 7200, 86_400, 3e7, 3e13]) {
      for (const aspect of [1.6, 0.45]) expect(Math.abs(northOnScreen(cine, t, aspect)), `t = ${t}, aspect ${aspect}`).toBeLessThan(30);
    }
  });
});
