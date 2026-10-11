/**
 * Google-Earth-style camera for the globe. State is a target point on the surface plus range,
 * heading and tilt (the deep-link `c=` parameter), so a pose is engine-independent and readable.
 *
 *   drag (mouse / one finger)           pan the globe
 *   right-drag, ctrl/shift-drag         heading (x) and tilt (y)
 *   wheel / pinch                       zoom
 *   two-finger twist / vertical drag    heading / tilt
 *
 * The camera position is computed in float64 (three's Vector3 uses JS numbers), which keeps
 * model-view matrices precise near the ground; see docs/plan/decisions.md D5.
 */
import { MathUtils, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { EARTH_RADIUS } from '../config';
import { DEG, enuBasis, latLonToVec, wrapLon } from '../core/geo';
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

export function maxTiltFor(range: number): number {
  return 85 - 50 * MathUtils.smoothstep(range, 2e5, 1.2e7);
}

interface PointerInfo {
  x: number;
  y: number;
}

export class GlobeControls {
  pose: CameraPose;
  enabled = true;
  minRange = 1_000;
  maxRange = 6e7;
  /** Called after any user interaction (for deep-link updates, cinematic interruption, etc.). */
  onUserInput: (() => void) | null = null;

  private readonly pointers = new Map<number, PointerInfo>();
  private mode: 'none' | 'pan' | 'orbit' | 'pinch' = 'none';
  private velocity = { lat: 0, lon: 0, heading: 0, tilt: 0, zoom: 0 };
  private lastMoveTime = 0;
  private pinchStart = { dist: 0, angle: 0, midY: 0, range: 0, heading: 0, tilt: 0 };
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
    this.velocity = { lat: 0, lon: 0, heading: 0, tilt: 0, zoom: 0 };
    this.clamp();
    this.dirty = true;
  }

  getPose(): CameraPose {
    return { ...this.pose };
  }

  /** Apply inertia and write the pose to the camera. Returns true if the camera moved. */
  update(dt: number): boolean {
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
    const f = poseToFrame(this.pose);
    this.camera.position.copy(f.position);
    this.camera.quaternion.copy(f.quaternion);
    this.camera.updateMatrixWorld(true);
    this.dirty = false;
    return true;
  }

  // ── input ──────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velocity = { lat: 0, lon: 0, heading: 0, tilt: 0, zoom: 0 };
    if (this.pointers.size === 2) {
      this.mode = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = {
        dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midY: (a.y + b.y) / 2,
        range: this.pose.range, heading: this.pose.heading, tilt: this.pose.tilt,
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
    prev.x = e.clientX;
    prev.y = e.clientY;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveTime) / 1000;
    this.lastMoveTime = now;

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
    this.pointers.delete(e.pointerId);
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
    // Stop inertia if the pointer rested before release.
    if (performance.now() - this.lastMoveTime > 80) this.velocity = { lat: 0, lon: 0, heading: 0, tilt: 0, zoom: 0 };
    if (this.pointers.size === 0) this.mode = 'none';
    else if (this.pointers.size === 1) this.mode = 'pan';
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines → pixels
    this.pose.range *= Math.exp(delta * 0.0015);
    this.clamp();
    this.dirty = true;
    this.onUserInput?.();
  };

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
