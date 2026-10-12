/**
 * The "main event" camera: a scripted sequence of shots driven by simulation time, so scrubbing the
 * timeline scrubs the camera too. Shots are blended in spherical coordinates around Earth's centre
 * (radius in log space, direction by slerp) so transitions never cut through the planet.
 *
 *   ride     beside the asteroid on its last hour in, Earth growing ahead          t < −45 s
 *   hold     ~350 km south of the crater, looking north, watching entry and impact  −35 s … 3 s
 *   aftermath over the crater, pulling back as the plume and fireball rise          25 s … 30 min
 *   global   the whole hemisphere, slowly turning, for hours to millennia          > 2 h
 *
 * Every shot keeps geographic north toward the top of the screen, so the continents read like a map
 * at first sight (the asteroid came from the north-east, so it crosses from the right).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { DEG, enuBasis, latLonToVec } from '../core/geo';
import type { Asteroid } from '../render/asteroid';
import { poseToFrame } from './globe-controls';

/** Earth's spin axis (world +Y): the 'up' that puts north at the top of the screen. */
const NORTH = new Vector3(0, 1, 0);

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
  private readonly right: Vector3;  // screen right and up while riding along the path, north up
  private readonly screenUp: Vector3;
  private readonly south: Vector3;
  private readonly upLocal: Vector3;

  constructor(private readonly asteroid: Asteroid) {
    const { e, n, u } = enuBasis(this.site.lat, this.site.lon);
    const from = (IMPACT.headingDeg.value + 180) * DEG;
    const horiz = n.clone().multiplyScalar(Math.cos(from)).addScaledVector(e, Math.sin(from));
    const el = IMPACT.angleDeg.value * DEG;
    this.back = horiz.clone().multiplyScalar(Math.cos(el)).addScaledVector(u, Math.sin(el)).normalize();
    this.right = new Vector3().crossVectors(this.back, NORTH).negate().normalize();
    this.screenUp = new Vector3().crossVectors(this.right, this.back).negate();
    this.south = n.clone().negate();
    this.upLocal = u;
  }

  private ride(t: number, aspect: number): CameraFrame {
    const R = this.asteroid.radiusM;
    const a = this.asteroid.positionAt(Math.min(t, 0));
    const fwd = this.back.clone().negate();
    // Behind the rock and off to its right, so it sits left of and below Earth; look past it, north up.
    // On a narrow (portrait) screen, further back and below, so the smaller rock stays in the lower-left
    // corner instead of covering the Americas.
    const p = smooth(1.1, 0.45, aspect);
    const position = a.clone()
      .addScaledVector(this.back, (7 + 7 * p) * R)
      .addScaledVector(this.right, (2.6 - 0.5 * p) * R)
      .addScaledVector(this.screenUp, (1.2 + 3.1 * p) * R);
    const target = a.clone().addScaledVector(fwd, 40 * R);
    return { position, target, up: NORTH.clone() };
  }

  private hold(t: number): CameraFrame {
    // South of the crater looking north, a little up-range: the entry streak is seen mostly in profile,
    // coming in from the right, with the Gulf and North America beyond.
    const position = this.impact.clone()
      .addScaledVector(this.south, 360_000).addScaledVector(this.back, 110_000).addScaledVector(this.upLocal, 150_000);
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
    // Facing about north from the hold shot, turning to due north as it pulls back.
    const heading = -8 * (1 - k);
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

  /** Camera frame at sim time t, for a screen of this width / height. */
  frame(t: number, aspect = 1.6): CameraFrame {
    const shots: [CameraFrame, number][] = [];
    const wRide = 1 - smooth(-45, -35, t);
    const wHold = smooth(-45, -35, t) * (1 - smooth(3, 25, t));
    const wAfter = smooth(3, 25, t) * (1 - smooth(1800, 7200, t));
    const wGlobal = smooth(1800, 7200, t);
    if (wRide > 1e-4) shots.push([this.ride(t, aspect), wRide]);
    if (wHold > 1e-4) shots.push([this.hold(t), wHold]);
    if (wAfter > 1e-4) shots.push([this.aftermath(t), wAfter]);
    if (wGlobal > 1e-4) shots.push([this.global(t), wGlobal]);
    return blend(shots);
  }

  /** Apply to a camera: position + orientation. */
  apply(t: number, camera: { position: Vector3; quaternion: Quaternion; aspect?: number; updateMatrixWorld(force?: boolean): void }): void {
    const f = this.frame(t, camera.aspect);
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
