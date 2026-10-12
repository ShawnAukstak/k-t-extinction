/**
 * The impactor: a ~13 km carbonaceous asteroid on its final approach, with the incandescent shock and
 * trail it makes crossing the atmosphere (~6 s at 20 km/s and 60°).
 *
 * Trajectory: a straight line in inertial space through the impact point, arriving at IMPACT.speedMs
 * from IMPACT.headingDeg + 180° at IMPACT.angleDeg above the horizon. The globe is Earth-fixed, so the
 * line is rotated back by Earth's spin (a 23.5 h day at 66 Ma): an hour out, the path has swung ~15°.
 *
 * Shape and albedo are unknown ("chosen"): an irregular, dark (albedo ~0.05), cratered body strewn with
 * boulders, as the C-type asteroids visited by spacecraft (Bennu, Ryugu, Mathilde) are. The large-scale
 * shape, craters and boulders are in the mesh; finer relief (down to metres) is drawn per pixel.
 *
 * Lighting: the Sun, plus sunlight reflected by the Earth onto the night side of the rock (earthshine),
 * which is negligible an hour out and about a fifth of direct sunlight in the last seconds.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Group,
  IcosahedronGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EARTH_RADIUS, IMPACT, SKY } from '../config';
import { DEG, enuBasis, latLonToVec } from '../core/geo';

const OMEGA = (2 * Math.PI) / (SKY.dayLengthH.value * 3600); // rad/s, Earth's spin at 66 Ma
const EARTH_ALBEDO = 0.3;
const SUN_INTENSITY = 22;

/** Deterministic pseudo-random numbers for the shape (same rock on every load). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

interface Feature { dir: Vector3; radius: number; depth: number }

/**
 * Lumpy, elongated body (about 1.4 : 1 : 0.9) with impact craters (bowls with raised rims, a few large
 * enough to flatten whole faces, as on Mathilde) and boulders. Vertex colours carry the albedo variation.
 */
export function rockGeometry(radius: number, detail: number): BufferGeometry {
  const ico = new IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico); // shared vertices → smooth normals
  ico.dispose();
  const rand = rng(66);
  const randDir = () => {
    const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return new Vector3(r * Math.cos(a), r * Math.sin(a), z);
  };
  const craters: Feature[] = [];
  for (let i = 0; i < 70; i++) {
    // Size–frequency: many small, few large (radius in radians of arc).
    const r = 0.05 + 0.55 * Math.pow(rand(), 4.5);
    craters.push({ dir: randDir(), radius: r, depth: r * (0.16 + 0.08 * rand()) });
  }
  const boulders: Feature[] = [];
  for (let i = 0; i < 260; i++) {
    const r = 0.012 + 0.035 * Math.pow(rand(), 3);
    boulders.push({ dir: randDir(), radius: r, depth: r * (0.35 + 0.3 * rand()) });
  }
  const p = g.attributes.position as BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const v = new Vector3();
  const stretch = new Vector3(1.25, 0.9, 0.85);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 0, a = 1, f = 1.3;
    for (let o = 0; o < 6; o++) { d += a * noise3(v.x * f + 11, v.y * f + 3, v.z * f + 7); a *= 0.5; f *= 2.1; }
    let h = 0.26 * d;
    let fresh = 0; // bright, recently exposed material (crater floors, boulders)
    for (const c of craters) {
      const ang = Math.acos(Math.min(1, v.dot(c.dir)));
      const x = ang / c.radius;
      if (x > 1.6) continue;
      // Bowl inside, raised rim just outside, fading ejecta blanket.
      h += x < 1 ? -c.depth * (1 - x * x) : 0;
      h += c.depth * 0.35 * Math.exp(-((x - 1) * (x - 1)) / 0.035);
      if (x < 1.15 && c.radius < 0.12) fresh += 0.5 * (1 - x / 1.15);
    }
    for (const b of boulders) {
      const ang = Math.acos(Math.min(1, v.dot(b.dir)));
      const x = ang / b.radius;
      if (x > 1) continue;
      h += b.depth * Math.sqrt(1 - x * x);
      fresh += 0.6 * (1 - x);
    }
    v.multiply(stretch).multiplyScalar(radius * (1 + h));
    p.setXYZ(i, v.x, v.y, v.z);
    // Dark grey-brown (albedo ~0.05) with slightly brighter fresh material.
    const k = 0.9 + 0.12 * noise3(v.x / radius * 4 + 5, v.y / radius * 4, v.z / radius * 4) + Math.min(0.5, fresh);
    colors[i * 3] = 0.06 * k; colors[i * 3 + 1] = 0.056 * k; colors[i * 3 + 2] = 0.052 * k;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Fine relief drawn per pixel: rubble (fbm) and two scales of small craters, faded below pixel size. */
const RELIEF_GLSL = /* glsl */ `
varying vec3 vObj;
float rh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec3 rh3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rh(i), rh(i + vec3(1, 0, 0)), f.x), mix(rh(i + vec3(0, 1, 0)), rh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rh(i + vec3(0, 0, 1)), rh(i + vec3(1, 0, 1)), f.x), mix(rh(i + vec3(0, 1, 1)), rh(i + vec3(1, 1, 1)), f.x), f.y), f.z) * 2.0 - 1.0;
}
// Distance to the nearest random point, in cells (for crater bowls).
float cells(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + rh3(i + o) * 0.8 + 0.1 - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
float crater(float d, float r) {
  float x = d / r;
  return x < 1.0 ? -(1.0 - x * x) : 0.3 * exp(-(x - 1.0) * (x - 1.0) / 0.05);
}
/** Height (metres) of the fine relief at object-space point p; footprint = metres per pixel. */
float relief(vec3 p, float footprint) {
  float h = 0.0, amp = 90.0, freq = 1.0 / 900.0;
  for (int o = 0; o < 7; o++) {
    float wl = 1.0 / freq;
    float fade = smoothstep(2.0, 6.0, wl / footprint);
    h += fade * amp * vnoise(p * freq + float(o) * 7.31);
    amp *= 0.48; freq *= 2.03;
  }
  float c1 = smoothstep(2.0, 8.0, 600.0 / footprint), c2 = smoothstep(2.0, 8.0, 150.0 / footprint);
  h += c1 * 60.0 * crater(cells(p / 600.0), 0.32);
  h += c2 * 14.0 * crater(cells(p / 150.0 + 3.7), 0.3);
  return h;
}
vec3 bumpNormal(vec3 surfPos, vec3 n, float h, float faceDirection) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}`;

function rockMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${RELIEF_GLSL}`)
      // Crater floors a touch darker, rims and rubble a touch brighter (the relief is computed once, here).
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fineH = relief(vObj, max(1.0, length(fwidth(vObj))));
        diffuseColor.rgb *= 0.9 + 0.2 * clamp(fineH / 120.0, -0.5, 0.5);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = bumpNormal(-vViewPosition, normal, fineH, faceDirection);`);
  };
  return m;
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

const NOISE_GLSL = /* glsl */ `
float gh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float gnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1, 0, 0)), f.x), mix(gh(i + vec3(0, 1, 0)), gh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gh(i + vec3(0, 0, 1)), gh(i + vec3(1, 0, 1)), f.x), mix(gh(i + vec3(0, 1, 1)), gh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float gfbm(vec3 p) { return 0.55 * gnoise(p) + 0.28 * gnoise(p * 2.1) + 0.17 * gnoise(p * 4.3); }
/** Incandescence: white-hot → yellow → orange → deep red as k goes 0 → 1. */
vec3 heatColor(float k) {
  vec3 c = mix(vec3(1.0, 0.97, 0.92), vec3(1.0, 0.78, 0.38), smoothstep(0.0, 0.3, k));
  c = mix(c, vec3(1.0, 0.42, 0.12), smoothstep(0.25, 0.6, k));
  return mix(c, vec3(0.55, 0.12, 0.05), smoothstep(0.55, 1.0, k));
}`;

const shockFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uHeat;
uniform float uTime;
uniform float uRadius;
varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vLocal);
  float facing = abs(dot(vN, vV));
  float rim = pow(1.0 - facing, 1.4);
  float front = smoothstep(-0.3, 1.0, dir.y);   // the leading face (+y) takes the shock
  float flicker = 0.75 + 0.5 * gfbm(vLocal / uRadius * 2.5 + vec3(0.0, -uTime * 9.0, 0.0));
  vec3 c = heatColor(0.6 * (1.0 - front) + 0.25 * rim);
  float a = (0.25 + 1.4 * rim + 0.8 * front * facing) * (0.35 + front) * flicker;
  gl_FragColor = vec4(c * uHeat * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const trailFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uHeat;
uniform float uLength;
uniform float uTime;
uniform float uRadius;
varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  float along = clamp(-vLocal.y / uLength, 0.0, 1.0);          // 0 at the head, 1 at the tail
  float core = pow(abs(dot(vN, vV)), 1.6);                      // thick through the middle, soft edges
  // Turbulent streaks that stream back from the head.
  vec3 q = vec3(vLocal.x / uRadius, vLocal.y / (uRadius * 5.0) + uTime * 6.0, vLocal.z / uRadius);
  float turb = gfbm(q * 1.3);
  float streak = 0.55 + 0.9 * turb;
  vec3 c = heatColor(smoothstep(0.0, 0.6, along + 0.25 * (turb - 0.5)));
  float fall = (0.25 + 0.75 * exp(-along * 4.0)) * (1.0 - smoothstep(0.7, 1.0, along));
  float a = fall * core * streak * smoothstep(0.0, 0.02, along + 0.004);
  gl_FragColor = vec4(c * uHeat * a * 2.2, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** A camera-facing glow around the head: the bloom of a light far brighter than the screen can show. */
const haloVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  // Pulled toward the camera so the ground under the head doesn't slice it (the Earth's limb still does).
  mv.xyz += normalize(-mv.xyz) * uSize * 1.2;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const haloFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uHeat;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vUv);
  float g = exp(-r * r * 9.0) * 1.4 + exp(-r * 4.5) * 0.35;
  g *= 1.0 - smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(uColor * g * uHeat, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const TRAIL_LEN = 260_000;

export class Asteroid {
  readonly group = new Group();
  /** The Sun on the rock. */
  readonly light: DirectionalLight;
  /** Sunlight reflected off the Earth onto the rock's night side. */
  readonly earthshine: DirectionalLight;
  private readonly rock: Mesh;
  private readonly shock: Mesh;
  private readonly trail: Mesh;
  private readonly halo: Mesh;
  private readonly shockMat: ShaderMaterial;
  private readonly trailMat: ShaderMaterial;
  private readonly haloMat: ShaderMaterial;
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

    const R = this.radiusM;
    this.rock = new Mesh(rockGeometry(R, 56), rockMaterial());
    this.rock.name = 'asteroid';
    const time = { value: 0 };
    this.shockMat = new ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: shockFragment,
      uniforms: { uHeat: { value: 0 }, uTime: time, uRadius: { value: R } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    // The shock layer hugs the front and flares out to the sides.
    const sg = new SphereGeometry(R * 1.75, 64, 32);
    sg.scale(1, 0.8, 1);
    sg.translate(0, R * 0.25, 0);
    this.shock = new Mesh(sg, this.shockMat);
    this.trailMat = new ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: trailFragment,
      uniforms: { uHeat: { value: 0 }, uLength: { value: TRAIL_LEN }, uTime: time, uRadius: { value: R } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    const tg = new CylinderGeometry(R * 1.6, R * 7, TRAIL_LEN, 48, 24, true);
    tg.translate(0, -TRAIL_LEN / 2, 0); // head at the origin, tail along −y
    this.trail = new Mesh(tg, this.trailMat);
    this.haloMat = new ShaderMaterial({
      vertexShader: haloVertex, fragmentShader: haloFragment,
      uniforms: { uHeat: { value: 0 }, uSize: { value: R * 14 }, uColor: { value: new Color(1.0, 0.82, 0.6) } },
      blending: AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.halo = new Mesh(new PlaneGeometry(2, 2), this.haloMat);
    for (const m of [this.rock, this.shock, this.trail, this.halo]) { m.frustumCulled = false; m.renderOrder = 3; }
    this.halo.renderOrder = 4;
    this.group.add(this.rock, this.shock, this.trail, this.halo);
    this.group.name = 'impactor';
    this.light = new DirectionalLight(0xffffff, SUN_INTENSITY);
    this.earthshine = new DirectionalLight(new Color(0.55, 0.7, 1.0), 0);
    this.time = time;
  }

  private readonly time: { value: number };

  /** Lights to add to the scene alongside the group (each with its target). */
  get lights(): DirectionalLight[] {
    return [this.light, this.earthshine];
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
    this.time.value = tt;
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
    this.shockMat.uniforms.uHeat.value = Math.min(heat, 14);
    this.trailMat.uniforms.uHeat.value = Math.min(heat * 0.6, 9);
    // The halo grows with the glow but saturates, so the rock never hides behind a white disc.
    const glow = 1 - Math.exp(-heat / 6);
    this.haloMat.uniforms.uHeat.value = glow * 0.9;
    this.haloMat.uniforms.uSize.value = this.radiusM * (3 + 6 * glow);
    for (const m of [this.shock, this.trail, this.halo]) m.visible = heat > 0.01;
    // Trail only as long as the path already inside the atmosphere.
    const inside = Math.max(1, Math.min(TRAIL_LEN, (110_000 - this.altitude) / Math.sin(IMPACT.angleDeg.value * DEG)));
    this.trail.scale.set(1, inside / TRAIL_LEN, 1); // the shader works in unscaled units (uLength = TRAIL_LEN)

    this.light.position.copy(this.position).addScaledVector(sunDir, 1e6);
    this.light.target.position.copy(this.position);
    this.light.target.updateMatrixWorld();
    // Earthshine: a disc of angular radius θ with albedo a under full sun gives a·sin²θ of direct
    // sunlight, times the lit fraction of the disc seen from here.
    const d = this.position.length();
    const sin2 = Math.min(1, (EARTH_RADIUS / d) ** 2);
    const up = this.position.clone().divideScalar(d);
    const phase = 0.5 + 0.5 * up.dot(sunDir);
    this.earthshine.intensity = SUN_INTENSITY * Math.max(0.004, EARTH_ALBEDO * sin2 * phase);
    this.earthshine.position.copy(this.position).addScaledVector(up, -1e6);
    this.earthshine.target.position.copy(this.position);
    this.earthshine.target.updateMatrixWorld();
  }

  /** Rotation that turns +y toward a direction (exported for tests). */
  static orient(dir: Vector3): Quaternion {
    return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  }
}
