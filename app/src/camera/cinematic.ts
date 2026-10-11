/**
 * The "main event" camera: a scripted sequence of shots driven by simulation time, so scrubbing the
 * timeline scrubs the camera too. Shots are blended in spherical coordinates around Earth's centre
 * (radius in log space, direction by slerp) so transitions never cut through the planet.
 *
 *   ride     beside the asteroid on its last hour in, Earth growing ahead          t < −45 s
 *   hold     off to the side of the path, ~400 km away, watching entry and impact  −35 s … 3 s
 *   aftermath over the crater, pulling back as the plume and fireball rise          25 s … 30 min
 *   global   the whole hemisphere, slowly turning, for hours to millennia          > 2 h
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { DEG, enuBasis, latLonToVec } from '../core/geo';
import type { Asteroid } from '../render/asteroid';
import { poseToFrame } from './globe-controls';

export interface CameraFrame {
  position: Vector3;
  target: Vector3;
  up: Vector3;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export class Cinematic {
  private readonly site = IMPACT.site.value;
  private readonly impact = latLonToVec(this.site.lat, this.site.lon, EARTH_RADIUS);
  private readonly back: Vector3;   // up the path, toward where the asteroid came from
  private readonly side: Vector3;   // horizontal, perpendicular to the path
  private readonly upLocal: Vector3;

  constructor(private readonly asteroid: Asteroid) {
    const { e, n, u } = enuBasis(this.site.lat, this.site.lon);
    const from = (IMPACT.headingDeg.value + 180) * DEG;
    const horiz = n.clone().multiplyScalar(Math.cos(from)).addScaledVector(e, Math.sin(from));
    const el = IMPACT.angleDeg.value * DEG;
    this.back = horiz.clone().multiplyScalar(Math.cos(el)).addScaledVector(u, Math.sin(el)).normalize();
    this.side = new Vector3().crossVectors(u, horiz).normalize();
    this.upLocal = u;
  }

  private ride(t: number): CameraFrame {
    const R = this.asteroid.radiusM;
    const a = this.asteroid.positionAt(Math.min(t, 0));
    const fwd = this.back.clone().negate();
    // Beside and slightly behind the rock; look past it toward Earth.
    const position = a.clone().addScaledVector(this.back, 7 * R).addScaledVector(this.side, 2.6 * R).addScaledVector(this.upLocal, 1.2 * R);
    const target = a.clone().addScaledVector(fwd, 40 * R);
    return { position, target, up: this.upLocal.clone() };
  }

  private hold(t: number): CameraFrame {
    // Off to the side of the path so the entry streak is seen in profile, a little up-range.
    const position = this.impact.clone()
      .addScaledVector(this.side, 360_000).addScaledVector(this.back, 110_000).addScaledVector(this.upLocal, 150_000);
    // Keep both the falling asteroid and the impact point in frame, then settle on the crater.
    const a = this.asteroid.positionAt(Math.min(t, 0));
    const w = 0.45 + 0.55 * smooth(-25, 2, t);
    const subject = a.lerp(this.impact, w);
    // Aim a little below the subject so it sits above the timeline bar.
    const dist = position.distanceTo(subject);
    const target = subject.addScaledVector(this.upLocal, -0.14 * dist);
    return { position, target, up: this.upLocal.clone() };
  }

  private aftermath(t: number): CameraFrame {
    const k = smooth(3, 1800, t);
    const range = Math.exp(Math.log(2_400_000) * (1 - k) + Math.log(7_000_000) * k);
    const heading = IMPACT.headingDeg.value + 90 - 25 * k;
    const tilt = 55 - 30 * k;
    return this.fromPose(this.site.lat, this.site.lon, range, heading, tilt);
  }

  private global(t: number): CameraFrame {
    // Slow drift: a quarter turn over the first year, then hold.
    const yrs = Math.max(0, t) / 31_557_600;
    const lon = this.site.lon + 15 - 60 * smooth(0, 1, yrs);
    return this.fromPose(this.site.lat + 8, lon, 17_000_000, 0, 0);
  }

  private fromPose(lat: number, lon: number, range: number, heading: number, tilt: number): CameraFrame {
    const f = poseToFrame({ lat, lon, range, heading, tilt });
    const up = new Vector3(0, 1, 0).applyQuaternion(f.quaternion);
    return { position: f.position, target: f.target, up };
  }

  /** Camera frame at sim time t. */
  frame(t: number): CameraFrame {
    const shots: [CameraFrame, number][] = [];
    const wRide = 1 - smooth(-45, -35, t);
    const wHold = smooth(-45, -35, t) * (1 - smooth(3, 25, t));
    const wAfter = smooth(3, 25, t) * (1 - smooth(1800, 7200, t));
    const wGlobal = smooth(1800, 7200, t);
    if (wRide > 1e-4) shots.push([this.ride(t), wRide]);
    if (wHold > 1e-4) shots.push([this.hold(t), wHold]);
    if (wAfter > 1e-4) shots.push([this.aftermath(t), wAfter]);
    if (wGlobal > 1e-4) shots.push([this.global(t), wGlobal]);
    return blend(shots);
  }

  /** Apply to a camera: position + orientation. */
  apply(t: number, camera: { position: Vector3; quaternion: Quaternion; updateMatrixWorld(force?: boolean): void }): void {
    const f = this.frame(t);
    camera.position.copy(f.position);
    const m = new Matrix4().lookAt(f.position, f.target, f.up);
    camera.quaternion.setFromRotationMatrix(m);
    camera.updateMatrixWorld(true);
  }
}

/** Weighted blend of frames: position in (log radius, direction) about Earth's centre, targets and up linearly. */
function blend(shots: [CameraFrame, number][]): CameraFrame {
  if (shots.length === 1) return shots[0][0];
  const total = shots.reduce((a, [, w]) => a + w, 0);
  let logR = 0;
  const dir = new Vector3();
  const target = new Vector3();
  const up = new Vector3();
  for (const [f, w0] of shots) {
    const w = w0 / total;
    const r = f.position.length();
    logR += Math.log(r) * w;
    dir.addScaledVector(f.position.clone().divideScalar(r), w);
    target.addScaledVector(f.target, w);
    up.addScaledVector(f.up, w);
  }
  const position = dir.normalize().multiplyScalar(Math.exp(logR));
  return { position, target, up: up.normalize() };
}
