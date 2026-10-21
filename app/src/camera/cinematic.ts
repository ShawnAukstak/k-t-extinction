/**
 * The "main event" camera: a scripted sequence of shots driven by simulation time, so scrubbing the
 * timeline scrubs the camera too. Shots are blended in spherical coordinates around Earth's centre
 * (radius in log space, direction by slerp) so transitions never cut through the planet.
 *
 *   ride     beside the asteroid on its last hour in, Earth growing ahead          t < −25 s
 *   hold     ~350 km south of the crater, looking north, watching entry and impact  −10 s … 3 s
 *   aftermath over the crater, pulling back as the plume and fireball rise          25 s … 30 min
 *   global   the whole hemisphere, slowly turning, for hours to millennia          > 2 h
 *
 * Every shot keeps geographic north toward the top of the screen, so the continents read like a map
 * at first sight (the asteroid came from the north-east, so it crosses from the right).
 *
 * Each shot also has a subject (the asteroid, the impact point, the crater, the planet) that the viewer
 * can turn around and zoom toward (`FollowOffset`) without losing it: the subject keeps its place on
 * screen, and the camera stays above the ground.
 */
import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { DEG, enuBasis, latLonToVec } from '../core/geo';
import type { Asteroid } from '../render/asteroid';
import { type FollowOffset, poseToFrame } from './globe-controls';

/** Earth's spin axis (world +Y): the 'up' that puts north at the top of the screen. */
const NORTH = new Vector3(0, 1, 0);

export interface CameraFrame {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  /** What the viewer turns around: the shot's subject. */
  pivot: Vector3;
  /** The axis turns are about ('up' for the subject). */
  axis: Vector3;
}

/** Closest the camera may come to the subject, in asteroid radii, and how far out a zoom may take it. */
const MIN_DISTANCE_R = 2.5;
const MAX_ZOOM = 5;
/** Lowest the camera may go when turned or zoomed, m (or the shot's own altitude, if lower). */
const MIN_ALTITUDE = 5_000;

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
    return { position, target, up: NORTH.clone(), pivot: a.clone(), axis: NORTH.clone() };
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
    const target = subject.clone().addScaledVector(this.upLocal, -0.14 * dist);
    return { position, target, up: this.upLocal.clone(), pivot: subject, axis: this.upLocal.clone() };
  }

  private aftermath(t: number): CameraFrame {
    const k = smooth(3, 1800, t);
    const range = Math.exp(Math.log(2_400_000) * (1 - k) + Math.log(7_000_000) * k);
    // Facing about north from the hold shot, turning to due north as it pulls back.
    const heading = -8 * (1 - k);
    const tilt = 55 - 30 * k;
    const f = this.fromPose(this.site.lat, this.site.lon, range, heading, tilt);
    return { ...f, pivot: f.target.clone(), axis: this.upLocal.clone() };
  }

  private global(t: number): CameraFrame {
    // Slow drift: a quarter turn over the first year, then hold.
    const yrs = Math.max(0, t) / 31_557_600;
    const lon = this.site.lon + 15 - 60 * smooth(0, 1, yrs);
    // The whole planet is the subject: turning spins it on its axis.
    return { ...this.fromPose(this.site.lat + 8, lon, 17_000_000, 0, 0), pivot: new Vector3(), axis: NORTH.clone() };
  }

  private fromPose(lat: number, lon: number, range: number, heading: number, tilt: number): Omit<CameraFrame, 'pivot' | 'axis'> {
    const f = poseToFrame({ lat, lon, range, heading, tilt });
    const up = new Vector3(0, 1, 0).applyQuaternion(f.quaternion);
    return { position: f.position, target: f.target, up };
  }

  /** Camera frame at sim time t, for a screen of this width / height. */
  frame(t: number, aspect = 1.6): CameraFrame {
    const shots: [CameraFrame, number][] = [];
    const wRide = 1 - smooth(-25, -10, t); // ~2.5 s on screen at the eased Impact pacing
    const wHold = smooth(-25, -10, t) * (1 - smooth(3, 25, t));
    const wAfter = smooth(3, 25, t) * (1 - smooth(1800, 7200, t));
    const wGlobal = smooth(1800, 7200, t);
    if (wRide > 1e-4) shots.push([this.ride(t, aspect), wRide]);
    if (wHold > 1e-4) shots.push([this.hold(t), wHold]);
    if (wAfter > 1e-4) shots.push([this.aftermath(t), wAfter]);
    if (wGlobal > 1e-4) shots.push([this.global(t), wGlobal]);
    return blend(shots);
  }

  /**
   * Apply to a camera: position + orientation, turned and zoomed around the subject by `offset` if given.
   * The offset is limited in place (above the ground, not through the subject), so a drag past a limit
   * doesn't wind up.
   */
  apply(t: number, camera: { position: Vector3; quaternion: Quaternion; aspect?: number; updateMatrixWorld(force?: boolean): void }, offset?: FollowOffset): void {
    const f = this.frame(t, camera.aspect);
    camera.quaternion.setFromRotationMatrix(new Matrix4().lookAt(f.position, f.target, f.up));
    camera.position.copy(f.position);
    if (offset) this.turn(f, camera.position, camera.quaternion, offset);
    camera.updateMatrixWorld(true);
  }

  /** Rigidly turn the camera about the subject (yaw about the shot's axis, then up over it) and move it toward or away. */
  private turn(f: CameraFrame, position: Vector3, quaternion: Quaternion, o: FollowOffset): void {
    const off = position.clone().sub(f.pivot);
    const dist = off.length();
    if (dist < 1) return;
    const place = (yaw: number, pitch: number, zoom: number) => {
      const r = new Quaternion().setFromAxisAngle(f.axis, yaw * DEG);
      const turned = off.clone().applyQuaternion(r);
      const side = new Vector3().crossVectors(turned, f.axis);
      if (side.lengthSq() > 1e-12) r.premultiply(new Quaternion().setFromAxisAngle(side.normalize(), pitch * DEG));
      return { r, position: f.pivot.clone().addScaledVector(off.clone().applyQuaternion(r), zoom) };
    };
    // Up over the subject: its elevation above the subject's horizon, from below (a subject in space) or
    // from just above the ground (a subject on it) up to nearly overhead.
    const elev = Math.asin(MathUtils.clamp(off.dot(f.axis) / dist, -1, 1)) / DEG;
    const onGround = 1 - smooth(30e3, 300e3, Math.abs(f.pivot.length() - EARTH_RADIUS));
    let { yaw, pitch, zoom } = o;
    pitch = MathUtils.clamp(elev + pitch, Math.min(elev, -80 + 85 * onGround), Math.max(elev, 85)) - elev;
    zoom = MathUtils.clamp(zoom, (MIN_DISTANCE_R * this.asteroid.radiusM) / dist, MAX_ZOOM);
    // Never below the ground: give back zoom first, then the tilt, then the turn (the shot itself is fine).
    const minAlt = Math.min(MIN_ALTITUDE, position.length() - EARTH_RADIUS);
    const ok = (y: number, p: number, z: number) => place(y, p, z).position.length() - EARTH_RADIUS >= minAlt;
    if (!ok(yaw, pitch, zoom)) zoom = Math.exp(closest((lz) => ok(yaw, pitch, Math.exp(lz)), Math.log(zoom), 0));
    if (!ok(yaw, pitch, zoom)) pitch = closest((p) => ok(yaw, p, zoom), pitch, 0);
    if (!ok(yaw, pitch, zoom)) yaw = closest((y) => ok(y, 0, zoom), yaw, 0);
    Object.assign(o, { yaw, pitch, zoom });
    const p = place(yaw, pitch, zoom);
    position.copy(p.position);
    quaternion.premultiply(p.r);
  }
}

/** The value nearest `want` that passes, bisecting toward `safe` (which is assumed to pass). */
function closest(pass: (x: number) => boolean, want: number, safe: number): number {
  let bad = want, good = safe;
  for (let i = 0; i < 24; i++) {
    const mid = (bad + good) / 2;
    if (pass(mid)) good = mid; else bad = mid;
  }
  return good;
}

/** Weighted blend of frames: position in (log radius, direction) about Earth's centre, the rest linearly. */
function blend(shots: [CameraFrame, number][]): CameraFrame {
  if (shots.length === 1) return shots[0][0];
  const total = shots.reduce((a, [, w]) => a + w, 0);
  let logR = 0;
  const dir = new Vector3();
  const target = new Vector3();
  const up = new Vector3();
  const pivot = new Vector3();
  const axis = new Vector3();
  for (const [f, w0] of shots) {
    const w = w0 / total;
    const r = f.position.length();
    logR += Math.log(r) * w;
    dir.addScaledVector(f.position.clone().divideScalar(r), w);
    target.addScaledVector(f.target, w);
    up.addScaledVector(f.up, w);
    pivot.addScaledVector(f.pivot, w);
    axis.addScaledVector(f.axis, w);
  }
  const position = dir.normalize().multiplyScalar(Math.exp(logR));
  return { position, target, up: up.normalize(), pivot, axis: axis.normalize() };
}
