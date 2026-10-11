/**
 * The impact plume and ejecta curtain as a raymarched volume, in true spherical geometry around the
 * crater, for the first hour or two.
 *
 *   0–8 s      the fireball (EIEP radius of maximum radiation) — an incandescent, rising ball
 *   0–180 s    the ejecta curtain grows: Artemieva & Morgan's 180 s field, scaled self-similarly
 *   180–3600 s Artemieva & Morgan 2020 FIG 2 dust density fields, blended between keyframes
 *
 * Rendered at reduced resolution into a half-float target and composited over the scene; the Earth's
 * surface occludes it analytically. Brightness and opacity are visual choices on top of the model's
 * density (labelled "model" for extent and timing).
 */
import {
  ClampToEdgeWrapping, CustomBlending, DataTexture, HalfFloatType, LinearFilter, Matrix3, Mesh, OneFactor,
  OneMinusSrcAlphaFactor, type PerspectiveCamera, RedFormat, Scene, ShaderMaterial, BufferGeometry,
  BufferAttribute, Vector3, Vector4, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import { IMPACT } from '../config';
import { latLonToVec } from '../core/geo';
import { atmosphereChunk } from './shaders/atmosphere';

interface PlumeMeta {
  width: number;
  tileHeight: number;
  tiles: { t: number; rmaxKm: number; zmaxKm: number }[];
}

const vert = /* glsl */ `
varying vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
#include <common>
${atmosphereChunk}
uniform sampler2D uPlume;
uniform float uTiles;
uniform vec4 uKA;            // tile, rmax km, zmax km, spatial scale (≥ 1 before the first keyframe)
uniform vec4 uKB;
uniform float uKW;
uniform float uT;
uniform float uSteps;
uniform float uFireR;
uniform float uFade;
uniform vec3 uImpactDir;
uniform vec3 uCamPosKm;
uniform mat3 uViewToWorld;
uniform vec2 uTanHalf;
varying vec2 vNdc;

float tileDensity(vec4 k, float r, float z) {
  r *= k.w; z *= k.w;
  if (r >= k.y || z >= k.z || k.x < 0.0) return 0.0;
  float v = (k.x + clamp(z / k.z, 0.5 / 64.0, 63.5 / 64.0)) / uTiles;
  float enc = texture2D(uPlume, vec2(r / k.y, v)).r;
  if (enc < 0.03) return 0.0;
  // The model domain is a box: fade out toward its edges instead of clipping (the real cloud went higher).
  // Rounded: the top tapers more toward the outer edge, like a rising mushroom.
  float rn = r / k.y, zn = z / k.z;
  float edge = smoothstep(1.0, 0.45, zn + 0.35 * rn * rn) * smoothstep(1.0, 0.6, rn);
  return pow(10.0, enc * 9.0 - 8.0) * edge;   // kg/m³
}

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float capAngle() { return max(uKA.y / uKA.w, uKB.y / uKB.w) / PR + 0.02; }

// Dust extinction (per km) and fireball fraction at a point (planet-centred km).
vec2 plumeAt(vec3 p) {
  float lp = length(p);
  float z = lp - PR;
  if (z < 0.0) return vec2(0.0);
  vec3 pn = p / lp;
  float ang = atan(length(cross(pn, uImpactDir)), dot(pn, uImpactDir));
  if (ang > capAngle()) return vec2(0.0);
  float r = ang * PR;
  float rho = mix(tileDensity(uKA, r, z), tileDensity(uKB, r, z), uKW);
  float fb = 0.0;
  if (uT < 90.0) {
    float rf = uFireR * (1.0 - exp(-uT / 3.0)) + 2.0 * max(0.0, uT - 8.0);
    float d = length(vec2(r, z - 0.35 * rf));
    fb = smoothstep(rf, 0.6 * rf, d) * exp(-uT / 25.0);
  }
  if (rho <= 0.0 && fb <= 0.0) return vec2(0.0);
  // Billows: two octaves of noise, drifting outward and upward with time.
  vec3 q = p / 38.0 + uImpactDir * (uT * 0.002);
  float billow = 0.15 + 1.8 * vnoise(q) * (0.4 + vnoise(p / 11.0));
  float sigma = 1.6 * rho * billow + fb * 0.08;
  return vec2(sigma, fb);
}

void main() {
  vec3 rd = normalize(uViewToWorld * normalize(vec3(vNdc * uTanHalf, -1.0)));
  vec3 ro = uCamPosKm;
  float zTop = max(uKA.z / uKA.w, uKB.z / uKB.w) + 20.0;
  vec2 shell = raySphere(ro, rd, PR + zTop);
  if (shell.y <= 0.0 || uFade <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 earth = raySphere(ro, rd, PR);
  float t0 = max(0.0, shell.x);
  float t1 = shell.y;
  if (earth.x > 0.0 && earth.x < earth.y) t1 = min(t1, earth.x);
  if (t1 <= t0) { gl_FragColor = vec4(0.0); return; }
  float n = uSteps;
  float dt = (t1 - t0) / n;
  float jitter = hash12(gl_FragCoord.xy + fract(uT) * 37.0);
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  float hot = exp(-uT / 50.0);
  float mu = dot(rd, uSunDir);
  float phase = 0.55 + 1.2 * pow(max(0.0, mu), 6.0);
  for (int i = 0; i < 64; i++) {
    if (float(i) >= n || trans < 0.02) break;
    vec3 p = ro + rd * (t0 + dt * (float(i) + jitter));
    vec2 s = plumeAt(p);
    float sigma = s.x;
    if (sigma <= 1e-6) continue;
    float a = 1.0 - exp(-sigma * dt);
    // Self-shadowing toward the Sun (two taps), Earth's shadow, and a little sky light.
    float sh = exp(-0.5 * (plumeAt(p + uSunDir * 12.0).x * 12.0 + plumeAt(p + uSunDir * 45.0).x * 33.0));
    vec3 sunT = sunTransmittance(p, uSunDir);
    // Low, spreading dust is darker (soot-laden) than the high curtain.
    float zKm = length(p) - PR;
    vec3 albedo = mix(vec3(0.20, 0.17, 0.14), vec3(0.42, 0.37, 0.31), smoothstep(30.0, 200.0, zKm));
    vec3 lit = albedo * (sunT * SUN_E * uSunScale * phase / PI * 0.55 * sh + 0.04);
    float rhoTerm = clamp(sigma / 1.6, 0.0, 1.0);
    float tempGlow = hot * rhoTerm * 5.0 + s.y * (300.0 * exp(-uT / 4.0) + 30.0);
    vec3 glow = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.92, 0.8), clamp(s.y * exp(-uT / 10.0), 0.0, 1.0)) * tempGlow;
    acc += trans * a * (lit + glow);
    trans *= 1.0 - a;
  }
  float alpha = (1.0 - trans) * uFade;
  gl_FragColor = vec4(acc * uFade, alpha);   // premultiplied
}
`;

const compositeFrag = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vNdc;
void main() {
  vec4 s = texture2D(uTex, vNdc * 0.5 + 0.5);
  if (s.a <= 0.0005) discard;
  gl_FragColor = vec4(s.rgb / s.a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * s.a, s.a);
}
`;

function fullScreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

export class Plume {
  private readonly scene = new Scene();
  private readonly compositeScene = new Scene();
  private readonly material: ShaderMaterial;
  private readonly target: WebGLRenderTarget;
  private meta: PlumeMeta | null = null;
  private readonly viewToWorld = new Matrix3();
  private readonly camKm = new Vector3();
  active = false;

  constructor(private readonly scale = 0.5, steps = 40) {
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
    this.material = new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uPlume: { value: null }, uTiles: { value: 1 },
        uKA: { value: new Vector4(-1, 1, 1, 1) }, uKB: { value: new Vector4(-1, 1, 1, 1) }, uKW: { value: 0 },
        uT: { value: 0 }, uSteps: { value: steps }, uFireR: { value: 169 }, uFade: { value: 0 },
        uImpactDir: { value: latLonToVec(IMPACT.site.value.lat, IMPACT.site.value.lon, 1) },
        uCamPosKm: { value: this.camKm }, uViewToWorld: { value: this.viewToWorld }, uTanHalf: { value: [1, 1] },
        uSunDir: { value: new Vector3(1, 0, 0) }, uSunScale: { value: 1 }, uHaze: { value: 0 },
      },
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const m = new Mesh(fullScreenTriangle(), this.material);
    m.frustumCulled = false;
    this.scene.add(m);
    const comp = new Mesh(fullScreenTriangle(), new ShaderMaterial({
      vertexShader: vert, fragmentShader: compositeFrag, uniforms: { uTex: { value: this.target.texture } },
      depthTest: false, depthWrite: false, transparent: true,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
    }));
    comp.frustumCulled = false;
    this.compositeScene.add(comp);
  }

  async load(baseUrl: string): Promise<boolean> {
    try {
      this.meta = (await (await fetch(`${baseUrl}/plume.json`)).json()) as PlumeMeta;
      const buf = new Uint8Array(await (await fetch(`${baseUrl}/plume.bin`)).arrayBuffer());
      const tex = new DataTexture(buf, this.meta.width, this.meta.tileHeight * this.meta.tiles.length, RedFormat);
      tex.minFilter = tex.magFilter = LinearFilter;
      tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      this.material.uniforms.uPlume.value = tex;
      this.material.uniforms.uTiles.value = this.meta.tiles.length;
      return true;
    } catch (e) {
      console.warn('plume data unavailable', e);
      return false;
    }
  }

  setFireballRadiusKm(r: number): void {
    this.material.uniforms.uFireR.value = r;
  }

  /** Update for sim time t; returns whether anything needs drawing. */
  update(t: number, camera: PerspectiveCamera, sunDir: Vector3, sunScale: number): boolean {
    const u = this.material.uniforms;
    const m = this.meta;
    const fade = t <= 0 ? 0 : Math.min(1, t / 0.5) * (1 - Math.min(1, Math.max(0, (t - 3600) / 3600)));
    this.active = !!m && fade > 0;
    if (!this.active || !m) return false;
    u.uFade.value = fade;
    u.uT.value = t;
    const tiles = m.tiles;
    const ka = u.uKA.value as Vector4, kb = u.uKB.value as Vector4;
    const set = (k: Vector4, i: number, scale = 1) => k.set(i, tiles[i].rmaxKm, tiles[i].zmaxKm, scale);
    if (t <= tiles[0].t) {
      // Before the first keyframe the curtain grows roughly self-similarly from the crater.
      set(ka, 0, tiles[0].t / Math.max(t, 1));
      set(kb, 0, tiles[0].t / Math.max(t, 1));
      u.uKW.value = 0;
    } else if (t >= tiles[tiles.length - 1].t) {
      set(ka, tiles.length - 1);
      set(kb, tiles.length - 1);
      u.uKW.value = 0;
    } else {
      let i = 0;
      while (tiles[i + 1].t < t) i++;
      set(ka, i);
      set(kb, i + 1);
      u.uKW.value = Math.log(t / tiles[i].t) / Math.log(tiles[i + 1].t / tiles[i].t);
    }
    (u.uSunDir.value as Vector3).copy(sunDir);
    u.uSunScale.value = sunScale;
    this.viewToWorld.setFromMatrix4(camera.matrixWorld);
    this.camKm.copy(camera.position).multiplyScalar(1 / 1000);
    const th = Math.tan((camera.fov * Math.PI) / 360);
    u.uTanHalf.value = [th * camera.aspect, th];
    return true;
  }

  /** Raymarch into the low-resolution target, then composite over whatever is on screen. */
  render(renderer: WebGLRenderer, camera: PerspectiveCamera): void {
    if (!this.active) return;
    const w = Math.max(1, Math.floor(renderer.domElement.width * this.scale));
    const h = Math.max(1, Math.floor(renderer.domElement.height * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = false;
    renderer.render(this.compositeScene, camera);
    renderer.autoClear = prevAuto;
    renderer.setClearColor(0x000000, 1);
  }
}
