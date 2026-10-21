import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { enuBasis, latLonToVec } from '../core/geo';
import { Asteroid } from '../render/asteroid';
import { Cinematic } from './cinematic';
import { frameToPose, maxTiltFor, poseToFrame } from './globe-controls';

const TIMES = [-3600, -2400, -1800, -1200, -900, -600, -300, -120, -60, -45, -40, -30, -25, -15, -10, 0, 3, 15, 60, 600, 1800, 3600, 7200, 86_400, 3e7, 3e13];
const ASPECTS = [1.6, 0.45];

/** A camera like the app's (45° vertical field of view) at a position and orientation. */
function viewCamera(position: Vector3, quaternion: Quaternion, aspect: number): PerspectiveCamera {
  const c = new PerspectiveCamera(45, aspect, 1, 1e9);
  c.position.copy(position);
  c.quaternion.copy(quaternion);
  c.updateMatrixWorld(true);
  return c;
}

/** Where the crater lands on screen (normalised device coordinates), and which way north points there (degrees clockwise from up). */
function crater(cam: PerspectiveCamera): { x: number; y: number; inFront: boolean; north: number } {
  const { lat, lon } = IMPACT.site.value;
  const site = latLonToVec(lat, lon, EARTH_RADIUS);
  const a = site.clone().project(cam);
  const b = site.clone().addScaledVector(enuBasis(lat, lon).n, 1000).project(cam);
  return { x: a.x, y: a.y, inFront: a.z < 1, north: (Math.atan2((b.x - a.x) * cam.aspect, b.y - a.y) * 180) / Math.PI };
}

function cineCamera(cine: Cinematic, t: number, aspect: number): PerspectiveCamera {
  const f = cine.frame(t, aspect);
  return viewCamera(f.position, new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(f.position, f.target, f.up)), aspect);
}

describe('cinematic camera', () => {
  const cine = new Cinematic(new Asteroid());

  it('keeps north toward the top of the screen in every shot, so the map reads at first sight', () => {
    for (const t of TIMES) {
      for (const aspect of ASPECTS) expect(Math.abs(crater(cineCamera(cine, t, aspect)).north), `t = ${t}, aspect ${aspect}`).toBeLessThan(30);
    }
  });

  it('hands over to the free camera with north still up and the crater still in view if it was', () => {
    for (const t of TIMES) {
      for (const aspect of ASPECTS) {
        const from = cineCamera(cine, t, aspect);
        const pose = frameToPose(from.position, from.quaternion);
        const at = `t = ${t}, aspect ${aspect}`;
        // Within the free camera's limits, so the controls won't move it again.
        expect(pose.range, at).toBeLessThan(1e8);
        expect(pose.tilt, at).toBeLessThanOrEqual(maxTiltFor(pose.range));
        const f = poseToFrame(pose);
        const c = crater(viewCamera(f.position, f.quaternion, aspect));
        expect(Math.abs(c.north), at).toBeLessThan(30);
        const inView = (k: ReturnType<typeof crater>) => k.inFront && Math.abs(k.x) < 1 && Math.abs(k.y) < 1;
        if (inView(crater(from))) expect(inView(c), `${at}: crater at ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`).toBe(true);
        // Earth stays about the same size on screen.
        const size = (cam: PerspectiveCamera) => EARTH_RADIUS / cam.position.length();
        expect(size(viewCamera(f.position, f.quaternion, aspect)) / size(from), at).toBeGreaterThan(0.85);
      }
    }
  });

  it('turns and zooms around the subject without losing it or going below the ground', () => {
    const offsets = [
      { yaw: 120, pitch: 30, zoom: 0.4 },
      { yaw: -90, pitch: -60, zoom: 3 },
      { yaw: 180, pitch: -500, zoom: 0.001 }, // past every limit
      { yaw: 0, pitch: 500, zoom: 1000 },
    ];
    for (const t of TIMES) {
      for (const aspect of ASPECTS) {
        const base = new PerspectiveCamera(45, aspect, 1, 1e9);
        cine.apply(t, base);
        const pivot = cine.frame(t, aspect).pivot;
        const p0 = pivot.clone().project(base);
        const baseAlt = base.position.length() - EARTH_RADIUS;
        for (const o0 of offsets) {
          const o = { ...o0 };
          const cam = new PerspectiveCamera(45, aspect, 1, 1e9);
          cine.apply(t, cam, o);
          const at = `t = ${t}, aspect ${aspect}, offset ${JSON.stringify(o0)}`;
          const p1 = pivot.clone().project(cam);
          expect(Math.hypot(p1.x - p0.x, p1.y - p0.y), `${at}: the subject moved on screen`).toBeLessThan(1e-3);
          expect(cam.position.length() - EARTH_RADIUS, at).toBeGreaterThan(Math.min(5_000, baseAlt) - 1);
          expect(cam.position.distanceTo(pivot), at).toBeGreaterThan(2 * 5_000);
          // The offset is limited in place, so applying it again changes nothing (no wind-up past a limit).
          const again = { ...o };
          cine.apply(t, cam, again);
          expect(again.pitch, at).toBeCloseTo(o.pitch, 6);
          expect(again.zoom, at).toBeCloseTo(o.zoom, 6);
        }
        const still = new PerspectiveCamera(45, aspect, 1, 1e9);
        cine.apply(t, still, { yaw: 0, pitch: 0, zoom: 1 });
        expect(still.position.distanceTo(base.position)).toBeLessThan(1e-6);
      }
    }
  });
});
