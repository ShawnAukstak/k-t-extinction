/**
 * Google-Earth-style camera for the globe. State is a target point on the surface plus range,
 * heading and tilt (the deep-link `c=` parameter), so a pose is engine-independent and readable.
 *
 *   drag (mouse / one finger)           pan the globe
 *   right-drag, ctrl/shift-drag         heading (x) and tilt (y)
 *   wheel / pinch                       zoom
 *   two-finger twist / vertical drag    heading / tilt
 *
 * While following a scripted camera (the cinematic), the same gestures turn and zoom around its
 * subject instead (`follow`).
 *
 * The camera position is computed in float64 (three's Vector3 uses JS numbers), which keeps
 * model-view matrices precise near the ground; see docs/plan/decisions.md D5.
 */
import { MathUtils, Matrix4, type PerspectiveCamera, Quaternion, Ray, Sphere, Vector3 } from 'three';
import { EARTH_RADIUS } from '../config';
import { DEG, enuBasis, latLonToVec, vecToLatLon, wrapLon } from '../core/geo';
import type { CameraPose } from '../core/url-state';

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

export interface PoseFrame {
  position: Vector3;
  quaternion: Quaternion;
  target: Vector3;
}

/** Camera position and orientation for a pose (pure; used by the controls and by tests). */
export function poseToFrame(p: CameraPose, targetAltitude = 0): PoseFrame {
  const target = latLonToVec(p.lat, p.lon, EARTH_RADIUS + targetAltitude);
  const { e, n, u } = enuBasis(p.lat, p.lon);
  const h = p.heading * DEG, t = p.tilt * DEG;
  const look = n.clone().multiplyScalar(Math.cos(h)).addScaledVector(e, Math.sin(h)); // horizontal view dir
  const offset = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(look, -Math.sin(t)).multiplyScalar(p.range);
  const position = target.clone().add(offset);
  const forward = offset.clone().negate().normalize();
  const up = look.clone().multiplyScalar(Math.cos(t)).addScaledVector(u, Math.sin(t));
  _x.crossVectors(forward, up).normalize();
  _y.copy(up);
  _z.copy(forward).negate();
  _m.makeBasis(_x, _y, _z);
  return { position, quaternion: new Quaternion().setFromRotationMatrix(_m), target };
}

/**
 * The pose that best reproduces a camera's current view (used when leaving the cinematic). A pose has
 * no roll, so a rolled camera can't be matched exactly: this keeps the point at the centre of the
 * screen and which way is up on screen (the cinematic keeps north up), and gives up the viewing angle,
 * swinging the camera around that point. A camera that looks past the planet orbits the point below it.
 */
export function frameToPose(position: Vector3, quaternion: Quaternion): CameraPose {
  const forward = new Vector3(0, 0, -1).applyQuaternion(quaternion);
  const screenUp = new Vector3(0, 1, 0).applyQuaternion(quaternion);
  const hit = new Vector3();
  const ray = new Ray(position, forward);
  if (!ray.intersectSphere(new Sphere(new Vector3(), EARTH_RADIUS), hit)) hit.copy(position).setLength(EARTH_RADIUS);
  const ll = vecToLatLon(hit);
  const { e, n, u } = enuBasis(ll.lat, ll.lon);
  const offset = position.clone().sub(hit);
  const range = offset.length();
  offset.normalize();
  // Heading: screen-up along the ground (looking straight along the vertical, the view direction instead).
  const look = screenUp.addScaledVector(u, -screenUp.dot(u));
  if (look.lengthSq() < 1e-4) look.copy(forward).addScaledVector(u, -forward.dot(u));
  look.normalize();
  const heading = Math.atan2(look.dot(e), look.dot(n)) / DEG;
  const tilt = Math.max(0, Math.atan2(-offset.dot(look), offset.dot(u))) / DEG;
  return { lat: ll.lat, lon: ll.lon, range, heading: (heading + 360) % 360, tilt };
}

export function maxTiltFor(range: number): number {
  return 85 - 50 * MathUtils.smoothstep(range, 2e5, 1.2e7);
}

/** A turn and zoom on top of a scripted camera: degrees around the subject and up over it, and a distance factor. */
export interface FollowOffset {
  yaw: number;
  pitch: number;
  zoom: number;
}

/** A press that moves less than this (px) is a tap, not a drag. */
const TAP_SLOP = 6;
/** Fastest a flick keeps turning a followed view after release, degrees per second. */
const FLICK_MAX = 90;

interface PointerInfo {
  x: number;
  y: number;
}

export class GlobeControls {
  pose: CameraPose;
  enabled = true;
  minRange = 10;
  maxRange = 1e8; // past the cinematic's opening shot, ~70,000 km out
  /** Called after any user interaction (for deep-link updates, etc.). */
  onUserInput: (() => void) | null = null;
  /** While set, gestures turn and zoom this offset around a followed subject, and the pose is left alone. */
  follow: FollowOffset | null = null;
  /** A click/tap that didn't drag: client coordinates. */
  onTap: ((x: number, y: number) => void) | null = null;
  /** Terrain height (m) under a unit direction; keeps the target on the ground and the camera above it. */
  terrainHeight: ((dir: Vector3) => number) | null = null;
  /** Minimum clearance of the camera above the ground, m. */
  clearance = 3;
  private down = { x: 0, y: 0, t: 0, moved: 0 };
  private flight: { from: CameraPose; to: CameraPose; elapsed: number; duration: number; bump: number; resolve: () => void } | null = null;

  private readonly pointers = new Map<number, PointerInfo>();
  private mode: 'none' | 'pan' | 'orbit' | 'pinch' = 'none';
  private velocity = { lat: 0, lon: 0, heading: 0, tilt: 0, zoom: 0 };
  private followVelocity = { yaw: 0, pitch: 0 };
  private lastMoveTime = 0;
  private pinchStart = { dist: 0, angle: 0, midY: 0, range: 0, heading: 0, tilt: 0, yaw: 0, pitch: 0, zoom: 1 };
  private dirty = true;

  constructor(private readonly camera: PerspectiveCamera, private readonly dom: HTMLElement, initial: CameraPose) {
    this.pose = { ...initial };
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('pointerup', this.onPointerUp);
    this.dom.removeEventListener('pointercancel', this.onPointerUp);
    this.dom.removeEventListener('wheel', this.onWheel);
  }

  setPose(p: CameraPose): void {
    this.pose = { ...p };
    this.stop();
    this.clamp();
    this.dirty = true;
  }

  /** Stop any coasting after a flick. */
  stop(): void {
    this.velocity = { lat: 0, lon: 0, heading: 0, tilt: 0, zoom: 0 };
    this.followVelocity = { yaw: 0, pitch: 0 };
  }

  getPose(): CameraPose {
    return { ...this.pose };
  }

  /**
   * Fly smoothly to a pose: great-circle path, range interpolated in log space with an arc out to
   * see both ends on long hops. Resolves when it arrives (or immediately if interrupted).
   */
  flyTo(to: CameraPose, seconds = 2.8): Promise<void> {
    this.cancelFlight();
    const from = this.getPose();
    const a = latLonToVec(from.lat, from.lon, 1), b = latLonToVec(to.lat, to.lon, 1);
    const sepM = Math.acos(MathUtils.clamp(a.dot(b), -1, 1)) * EARTH_RADIUS;
    const peak = Math.max(from.range, to.range, sepM * 1.1);
    const bump = Math.max(0, Math.log(peak) - Math.max(Math.log(from.range), Math.log(to.range)));
    return new Promise((resolve) => {
      this.flight = { from, to: { ...to }, elapsed: 0, duration: Math.max(0.3, seconds), bump, resolve };
      this.stop();
    });
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  private cancelFlight(): void {
    if (!this.flight) return;
    const f = this.flight;
    this.flight = null;
    f.resolve();
  }

  private stepFlight(dt: number): void {
    const f = this.flight!;
    f.elapsed += dt;
    const k = Math.min(1, f.elapsed / f.duration);
    const e = k * k * (3 - 2 * k);
    const a = latLonToVec(f.from.lat, f.from.lon, 1), b = latLonToVec(f.to.lat, f.to.lon, 1);
    const ang = Math.acos(MathUtils.clamp(a.dot(b), -1, 1));
    let dir: Vector3;
    if (ang < 1e-9) dir = a;
    else {
      const s = Math.sin(ang);
      dir = a.clone().multiplyScalar(Math.sin((1 - e) * ang) / s).addScaledVector(b, Math.sin(e * ang) / s);
    }
    const ll = vecToLatLon(dir);
    const logR = Math.log(f.from.range) * (1 - e) + Math.log(f.to.range) * e + f.bump * Math.sin(Math.PI * e);
    const dh = ((f.to.heading - f.from.heading + 540) % 360) - 180;
    this.pose = {
      lat: ll.lat, lon: ll.lon, range: Math.exp(logR),
      heading: f.from.heading + dh * e, tilt: f.from.tilt + (f.to.tilt - f.from.tilt) * e,
    };
    this.clamp();
    this.dirty = true;
    if (k >= 1) {
      this.flight = null;
      f.resolve();
    }
  }

  /** Apply inertia and write the pose to the camera. Returns true if the camera moved. */
  update(dt: number): boolean {
    if (this.follow) {
      // The scripted camera writes the camera; only the follow offset's inertia runs here.
      const v = this.followVelocity;
      if (this.mode === 'none' && Math.abs(v.yaw) + Math.abs(v.pitch) > 1e-3) {
        this.turn(v.yaw * dt, v.pitch * dt);
        const decay = Math.exp(-dt * 4);
        v.yaw *= decay; v.pitch *= decay;
      }
      return false;
    }
    if (this.flight) this.stepFlight(dt);
    const v = this.velocity;
    if (this.mode === 'none') {
      const decay = Math.exp(-dt * 4);
      if (Math.abs(v.lat) + Math.abs(v.lon) + Math.abs(v.heading) + Math.abs(v.tilt) + Math.abs(v.zoom) > 1e-6) {
        this.pose.lat += v.lat * dt;
        this.pose.lon += v.lon * dt;
        this.pose.heading += v.heading * dt;
        this.pose.tilt += v.tilt * dt;
        this.pose.range *= Math.exp(v.zoom * dt);
        v.lat *= decay; v.lon *= decay; v.heading *= decay; v.tilt *= decay; v.zoom *= Math.exp(-dt * 8);
        this.clamp();
        this.dirty = true;
      }
    }
    if (!this.dirty) return false;
    const th = this.terrainHeight;
    const targetAlt = th ? th(latLonToVec(this.pose.lat, this.pose.lon, 1)) : 0;
    const f = poseToFrame(this.pose, targetAlt);
    if (th) {
      // Never below the ground: lift the camera along its local vertical if needed.
      const up = f.position.clone().normalize();
      const ground = EARTH_RADIUS + th(up);
      const alt = f.position.length() - ground;
      if (alt < this.clearance) f.position.addScaledVector(up, this.clearance - alt);
    }
    this.camera.position.copy(f.position);
    this.camera.quaternion.copy(f.quaternion);
    this.camera.updateMatrixWorld(true);
    this.dirty = false;
    return true;
  }

  // ── input ──────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.cancelFlight();
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    else this.down.moved = Infinity;
    this.stop();
    if (this.pointers.size === 2) {
      this.mode = 'pinch';
      const [a, b] = [...this.pointers.values()];
      const f = this.follow ?? { yaw: 0, pitch: 0, zoom: 1 };
      this.pinchStart = {
        dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midY: (a.y + b.y) / 2,
        range: this.pose.range, heading: this.pose.heading, tilt: this.pose.tilt, yaw: f.yaw, pitch: f.pitch, zoom: f.zoom,
      };
    } else {
      this.mode = e.button === 2 || e.ctrlKey || e.shiftKey || e.metaKey ? 'orbit' : 'pan';
    }
    this.lastMoveTime = performance.now();
    this.onUserInput?.();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.enabled) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.down.moved = Math.max(this.down.moved, Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y));
    prev.x = e.clientX;
    prev.y = e.clientY;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveTime) / 1000;
    this.lastMoveTime = now;
    if (this.follow) {
      this.followGesture(dx, dy, dt);
      return;
    }

    if (this.mode === 'pan') this.pan(dx, dy, dt);
    else if (this.mode === 'orbit') this.orbit(dx, dy, dt);
    else if (this.mode === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const midY = (a.y + b.y) / 2;
      const s = this.pinchStart;
      this.pose.range = s.range * (s.dist / Math.max(1, dist));
      this.pose.heading = s.heading - (angle - s.angle) / DEG;
      this.pose.tilt = s.tilt + (s.midY - midY) * 0.25;
    }
    this.clamp();
    this.dirty = true;
    this.onUserInput?.();
  };

  private onPointerUp = (e: PointerEvent): void => {
    const wasTap = this.pointers.size === 1 && this.pointers.has(e.pointerId) && this.down.moved < TAP_SLOP &&
      performance.now() - this.down.t < 400 && e.button === 0;
    this.pointers.delete(e.pointerId);
    if (wasTap && e.type === 'pointerup') {
      this.stop();
      this.onTap?.(e.clientX, e.clientY);
    }
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
    // Stop inertia if the pointer rested before release.
    if (performance.now() - this.lastMoveTime > 80) this.stop();
    if (this.pointers.size === 0) this.mode = 'none';
    else if (this.pointers.size === 1) this.mode = 'pan';
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.cancelFlight();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines → pixels
    if (this.follow) {
      this.follow.zoom *= Math.exp(delta * 0.0015);
      this.onUserInput?.();
      return;
    }
    this.pose.range *= Math.exp(delta * 0.0015);
    this.clamp();
    this.dirty = true;
    this.onUserInput?.();
  };

  /** Following: a drag turns around the subject (a tap's small wobble doesn't); two fingers zoom, twist and tilt. */
  private followGesture(dx: number, dy: number, dt: number): void {
    const f = this.follow!;
    if (this.mode === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const s = this.pinchStart;
      f.zoom = s.zoom * (s.dist / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)));
      f.yaw = s.yaw + (Math.atan2(b.y - a.y, b.x - a.x) - s.angle) / DEG;
      f.pitch = s.pitch - (s.midY - (a.y + b.y) / 2) * 0.25;
    } else if (this.down.moved >= TAP_SLOP) {
      // The scene turns with the pointer: drag right, the camera swings left around the subject.
      const dYaw = -dx * 0.3, dPitch = dy * 0.3;
      this.turn(dYaw, dPitch);
      // A flick coasts a little, at most a quarter turn a second.
      const cap = (v: number) => MathUtils.clamp(v, -FLICK_MAX, FLICK_MAX);
      this.followVelocity = { yaw: cap(dYaw / dt), pitch: cap(dPitch / dt) };
    } else return;
    this.onUserInput?.();
  }

  private turn(dYaw: number, dPitch: number): void {
    const f = this.follow!;
    f.yaw = ((f.yaw + dYaw + 540) % 360) - 180;
    f.pitch += dPitch;
  }

  /** Move the target so the ground follows the pointer (approximately, for any tilt). */
  private pan(dx: number, dy: number, dt: number): void {
    const h = this.dom.clientHeight || 1;
    const fovRad = this.camera.fov * DEG;
    const altitude = this.pose.range * Math.cos(this.pose.tilt * DEG);
    const metresPerPx = (Math.max(altitude, this.pose.range * 0.2) * 2 * Math.tan(fovRad / 2)) / h;
    // Far from the globe, a pixel can't move the target more than the globe's apparent size allows.
    const radPerPx = Math.min(metresPerPx / EARTH_RADIUS, (fovRad / h) * 1.2);
    const hd = this.pose.heading * DEG;
    // The target moves opposite to the drag: Δ = −dx·right + dy·up, where on the ground
    // up = cos h·N + sin h·E and right = cos h·E − sin h·N.
    const north = dy * Math.cos(hd) + dx * Math.sin(hd);
    const east = dy * Math.sin(hd) - dx * Math.cos(hd);
    const dLat = (north * radPerPx) / DEG;
    const dLon = (east * radPerPx) / DEG / Math.max(0.05, Math.cos(this.pose.lat * DEG));
    this.pose.lat += dLat;
    this.pose.lon += dLon;
    this.velocity.lat = dLat / dt;
    this.velocity.lon = dLon / dt;
  }

  private orbit(dx: number, dy: number, dt: number): void {
    const dh = dx * 0.25;
    const dtl = -dy * 0.25;
    this.pose.heading += dh;
    this.pose.tilt += dtl;
    this.velocity.heading = dh / dt;
    this.velocity.tilt = dtl / dt;
  }

  private clamp(): void {
    const p = this.pose;
    p.range = MathUtils.clamp(p.range, this.minRange, this.maxRange);
    p.lat = MathUtils.clamp(p.lat, -89.5, 89.5);
    p.lon = wrapLon(p.lon);
    p.heading = ((p.heading % 360) + 360) % 360;
    p.tilt = MathUtils.clamp(p.tilt, 0, maxTiltFor(p.range));
  }
}
