/**
 * Clouds (illustrative: the weather of a day 66 million years ago is unknowable). The pattern follows
 * the general circulation a warm greenhouse world still has: a cloudy equatorial convergence zone,
 * clear subtropical belts, storm tracks and spiral cyclones in mid-latitudes (counter-clockwise in the
 * north, clockwise in the south). Baked once into a cube render target on the GPU at start-up:
 *   R  cloud cover (opacity, 0–1)
 *   G  thickness (brighter, taller cores)
 * The globe shader samples it, drifts it with the zonal winds (trade easterlies, mid-latitude
 * westerlies) for the first days after the impact, shades it and casts its shadow on the ground.
 */
import {
  BackSide, CubeCamera, LinearFilter, LinearMipmapLinearFilter, Mesh, RGFormat, Scene, ShaderMaterial,
  SphereGeometry, UnsignedByteType, Vector4, WebGLCubeRenderTarget, type WebGLRenderer,
} from 'three';

/** Ashima Arts / Stefan Gustavson 3-D simplex noise (MIT). */
export const SIMPLEX_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

/**
 * Sampling the baked clouds: drift with the zonal winds for the first three days (shared by the globe,
 * seen from above, and the sky, seen from below). Needs uClouds, uT and PR (atmosphere chunk).
 */
export const CLOUD_SAMPLE_GLSL = /* glsl */ `
const float CLOUD_KM = 6.0;
vec3 cloudDrift(vec3 p) {
  float tc = clamp(uT, -259200.0, 259200.0);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float alat = abs(degrees(lat));
  // Zonal wind (m/s): trade easterlies, mid-latitude westerlies, polar easterlies.
  float u = -7.0 * exp(-pow(alat / 16.0, 2.0)) + 15.0 * exp(-pow((alat - 45.0) / 12.0, 2.0)) - 4.0 * smoothstep(65.0, 80.0, alat);
  float a = -u * tc / (PR * 1000.0 * max(0.1, cos(lat)));
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
vec2 cloudAt(vec3 p) { return textureCube(uClouds, cloudDrift(p)).rg; }
`;

const bakeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const bakeFragment = /* glsl */ `
${SIMPLEX_GLSL}
varying vec3 vDir;
uniform vec4 uCyclones[16];   // xyz centre (unit vector), w signed strength (+ north / − south)

float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 9; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, -3.1, 2.3);
    a *= 0.5;
  }
  return s;
}
/** Rotate p about axis k by angle a (Rodrigues). */
vec3 rot(vec3 p, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c);
}
void main() {
  vec3 p = normalize(vDir);
  float lat = degrees(asin(clamp(p.y, -1.0, 1.0)));
  float alat = abs(lat);
  // Cyclones: twist the noise domain around each centre, more strongly near the eye.
  vec3 q = p;
  float eye = 0.0, mass = 0.0;
  for (int i = 0; i < 16; i++) {
    vec4 c = uCyclones[i];
    float d = acos(clamp(dot(p, c.xyz), -1.0, 1.0));
    // Exponential falloff: a logarithmic spiral of bands rather than concentric rings.
    q = rot(q, c.xyz, c.w * 2.2 * exp(-d / 0.09));
    eye = max(eye, exp(-d * d / (0.01 * 0.01)) * step(1.0, abs(c.w)));
    mass += exp(-d * d / (0.16 * 0.16)) * 0.16;
  }
  // Mid-latitude systems are stretched east–west by the westerlies.
  float zonal = smoothstep(25.0, 45.0, alat) * (1.0 - smoothstep(65.0, 80.0, alat));
  vec3 s = q * vec3(1.0, 1.0 + 1.3 * zonal, 1.0);
  // Domain warp for billowing, swirled edges.
  vec3 w = vec3(fbm(s * 2.1 + 3.3, 4), fbm(s * 2.1 + 8.1, 4), fbm(s * 2.1 + 5.7, 4));
  float d = fbm(s * 3.0 + w * 0.9, 9) * 0.5 + 0.5;
  // Popcorn cumulus over the warm tropics.
  float pop = 1.0 - abs(snoise(s * 40.0 + w));
  d += 0.06 * pop * pop * (1.0 - smoothstep(10.0, 30.0, alat));
  // Cover by latitude: equatorial convergence zone, subtropical clear belts, storm tracks.
  float cover = 0.27 + 0.24 * exp(-pow(lat / 6.0, 2.0)) - 0.17 * exp(-pow((alat - 23.0) / 8.0, 2.0))
              + 0.17 * exp(-pow((alat - 52.0) / 11.0, 2.0)) + 0.05 * smoothstep(70.0, 85.0, alat) + mass;
  float th = 1.0 - cover;
  float alpha = smoothstep(th - 0.06, th + 0.16, d) * (1.0 - 0.9 * eye);
  float thick = smoothstep(th, th + 0.35, d);
  gl_FragColor = vec4(alpha, thick, 0.0, 1.0);
}`;

/** Deterministic cyclone centres (identical for everyone, so shared links match). */
function cyclones(): Vector4[] {
  let s = 20260611;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out: Vector4[] = [];
  for (let i = 0; i < 16; i++) {
    const north = i % 2 === 0;
    // Extratropical lows at 38–62°, plus a couple of tropical cyclones at 12–22°.
    const tropical = i >= 12;
    const latDeg = (tropical ? 12 + 10 * r() : 38 + 24 * r()) * (north ? 1 : -1);
    const lon = r() * Math.PI * 2;
    const lat = (latDeg * Math.PI) / 180;
    const strength = (tropical ? 1.3 : 0.7 + 0.5 * r()) * (north ? 1 : -1);
    out.push(new Vector4(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), strength));
  }
  return out;
}

export class Clouds {
  readonly target: WebGLCubeRenderTarget;

  constructor(size: number) {
    this.target = new WebGLCubeRenderTarget(size, {
      format: RGFormat, type: UnsignedByteType, generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter,
    });
  }

  /** Render the cloud field into the cube (once). */
  bake(renderer: WebGLRenderer): void {
    const scene = new Scene();
    const material = new ShaderMaterial({
      vertexShader: bakeVertex, fragmentShader: bakeFragment, side: BackSide, depthTest: false, depthWrite: false,
      uniforms: { uCyclones: { value: cyclones() } },
    });
    const sphere = new Mesh(new SphereGeometry(5, 96, 48), material);
    scene.add(sphere);
    const cam = new CubeCamera(0.1, 10, this.target);
    cam.update(renderer, scene); // the shader has no tone-mapping chunk: the raw field is stored
    sphere.geometry.dispose();
    material.dispose();
  }
}
