/**
 * The impactor: a ~13 km carbonaceous asteroid on its final approach, with the incandescent shock and
 * trail it makes crossing the atmosphere (~6 s at 20 km/s and 60°).
 *
 * Trajectory: a straight line in inertial space through the impact point, arriving at IMPACT.speedMs
 * from IMPACT.headingDeg + 180° at IMPACT.angleDeg above the horizon. The globe is Earth-fixed, so the
 * line is rotated back by Earth's spin (a 23.5 h day at 66 Ma): an hour out, the path has swung ~15°.
 *
 * Shape and albedo are unknown ("chosen"): an irregular, dark (albedo ~0.05) body, as C-type
 * asteroids such as Bennu and Ryugu are.
 */
import {
  AdditiveBlending, BufferAttribute, CylinderGeometry, DirectionalLight, Group, IcosahedronGeometry, Mesh,
  MeshStandardMaterial, Quaternion, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { EARTH_RADIUS, IMPACT, SKY } from '../config';
import { DEG, enuBasis, latLonToVec } from '../core/geo';

const OMEGA = (2 * Math.PI) / (SKY.dayLengthH.value * 3600); // rad/s, Earth's spin at 66 Ma

/** Deterministic value noise on the sphere for the rock's shape. */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wgt * hash(xi + dx, yi + dy, zi + dz);
  }
  return r * 2 - 1;
}

function rockGeometry(radius: number, detail: number): IcosahedronGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const p = g.attributes.position as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 0, a = 1, f = 1.3;
    for (let o = 0; o < 5; o++) { d += a * noise3(v.x * f + 11, v.y * f + 3, v.z * f + 7); a *= 0.5; f *= 2.1; }
    // Elongated, lumpy body (about 1.4 : 1 : 0.9), like many small asteroids.
    v.multiply(new Vector3(1.25, 0.9, 0.85)).multiplyScalar(radius * (1 + 0.28 * d));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const glowVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const shockFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uHeat;
varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
void main() {
  #include <logdepthbuf_fragment>
  float rim = pow(1.0 - abs(dot(vN, vV)), 1.5);
  float front = smoothstep(-0.2, 1.0, normalize(vLocal).y);   // brightest on the leading face (+y)
  vec3 c = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.95, 0.85), front);
  gl_FragColor = vec4(c * uHeat * (0.4 + 1.6 * rim) * (0.4 + front), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const trailFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uHeat;
uniform float uLength;
varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
void main() {
  #include <logdepthbuf_fragment>
  float along = clamp(0.5 - vLocal.y / uLength, 0.0, 1.0);     // 0 at the head, 1 at the tail
  float core = pow(abs(dot(vN, vV)), 2.0);
  vec3 c = mix(vec3(1.0, 0.92, 0.75), vec3(0.9, 0.3, 0.08), smoothstep(0.0, 0.5, along));
  float a = (1.0 - along) * (1.0 - along) * core;
  gl_FragColor = vec4(c * uHeat * a * 3.0, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Asteroid {
  readonly group = new Group();
  readonly light: DirectionalLight;
  private readonly rock: Mesh;
  private readonly shock: Mesh;
  private readonly trail: Mesh;
  private readonly shockMat: ShaderMaterial;
  private readonly trailMat: ShaderMaterial;
  /** Unit vector pointing back along the path (from the impact point toward where it came from), Earth-fixed at t = 0. */
  private readonly back: Vector3;
  private readonly impactPoint: Vector3;
  readonly radiusM = IMPACT.diameterM.value / 2;
  /** Latest position (Earth-fixed, metres) and altitude. */
  readonly position = new Vector3();
  altitude = Infinity;

  constructor() {
    const site = IMPACT.site.value;
    this.impactPoint = latLonToVec(site.lat, site.lon, EARTH_RADIUS);
    const { e, n, u } = enuBasis(site.lat, site.lon);
    // It came FROM the opposite of its heading, at angleDeg above the horizon.
    const from = (IMPACT.headingDeg.value + 180) * DEG;
    const horiz = n.clone().multiplyScalar(Math.cos(from)).addScaledVector(e, Math.sin(from));
    const el = IMPACT.angleDeg.value * DEG;
    this.back = horiz.multiplyScalar(Math.cos(el)).addScaledVector(u, Math.sin(el)).normalize();

    this.rock = new Mesh(
      rockGeometry(this.radiusM, 4),
      new MeshStandardMaterial({ color: 0x3d3b39, roughness: 0.95, metalness: 0 }), // albedo ≈ 0.05
    );
    this.rock.name = 'asteroid';
    this.shockMat = new ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: shockFragment, uniforms: { uHeat: { value: 0 } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.shock = new Mesh(new SphereGeometry(this.radiusM * 1.9, 48, 24), this.shockMat);
    const trailLen = 260_000;
    this.trailMat = new ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: trailFragment,
      uniforms: { uHeat: { value: 0 }, uLength: { value: trailLen } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    const tg = new CylinderGeometry(this.radiusM * 2.2, this.radiusM * 6, trailLen, 32, 1, true);
    tg.translate(0, -trailLen / 2, 0); // head at the origin, tail along −y
    this.trail = new Mesh(tg, this.trailMat);
    for (const m of [this.rock, this.shock, this.trail]) { m.frustumCulled = false; m.renderOrder = 3; }
    this.group.add(this.rock, this.shock, this.trail);
    this.group.name = 'impactor';
    this.light = new DirectionalLight(0xffffff, 22);
  }

  /** Earth-fixed position at time t (seconds since impact; t ≤ 0). */
  positionAt(t: number, out = new Vector3()): Vector3 {
    // Straight line in inertial space…
    out.copy(this.impactPoint).addScaledVector(this.back, -t * IMPACT.speedMs.value);
    // …seen from the rotating Earth: rotate about the spin axis (+Y) by −ω·t (t < 0 → the past).
    const a = OMEGA * t;
    const c = Math.cos(a), s = Math.sin(a);
    const x = out.x * c - out.z * s, z = out.x * s + out.z * c;
    return out.set(x, out.y, z);
  }

  update(t: number, sunDir: Vector3): void {
    const visible = t < 0.05;
    this.group.visible = visible;
    if (!visible) return;
    const tt = Math.min(t, 0);
    this.positionAt(tt, this.position);
    this.altitude = this.position.length() - EARTH_RADIUS;
    this.group.position.copy(this.position);
    // Orient: +y along the direction of travel (toward the ground).
    const next = this.positionAt(tt + 0.5, new Vector3());
    const dir = next.sub(this.position).normalize();
    this.group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    // Slow tumble (a few hours per rotation) so the shape reads as a body, not a sprite.
    this.rock.quaternion.setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), (t / 3600) * 2.4);
    // Heating: from ~100 km down, scaled by air density (scale height ~8 km).
    const h = this.altitude / 1000;
    const heat = h > 140 ? 0 : Math.min(60, 2.5 * Math.exp(-(h - 100) / 8) * (h < 100 ? 1 : (140 - h) / 40));
    this.shockMat.uniforms.uHeat.value = heat;
    this.trailMat.uniforms.uHeat.value = heat * 0.6;
    this.shock.visible = heat > 0.01;
    this.trail.visible = heat > 0.01;
    // Trail only as long as the path already inside the atmosphere.
    const inside = Math.max(1, Math.min(260_000, (110_000 - this.altitude) / Math.sin(IMPACT.angleDeg.value * DEG)));
    this.trail.scale.set(1, inside / 260_000, 1);
    this.light.position.copy(this.position).addScaledVector(sunDir, 1e6);
    this.light.target.position.copy(this.position);
    this.light.target.updateMatrixWorld();
  }

  /** Rotation that turns +y toward a direction (exported for tests). */
  static orient(dir: Vector3): Quaternion {
    return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  }
}
