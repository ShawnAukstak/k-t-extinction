/**
 * Background: a procedural star field (the real sky of 66 Ma can't be reconstructed — stars have
 * moved too far in 66 Myr) and a full-screen atmosphere pass that scatters sunlight over the stars
 * and around the planet's limb. The globe draws on top with its own aerial perspective.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CustomBlending, Matrix3, Mesh, OneFactor,
  type PerspectiveCamera, Points, ShaderMaterial, SrcAlphaFactor, Vector3, Vector4,
} from 'three';
import { CLOUD_SAMPLE_GLSL } from './clouds';
import { atmosphereChunk } from './shaders/atmosphere';

const skyVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const skyFragment = /* glsl */ `
#include <common>
${atmosphereChunk}
uniform mat3 uViewToWorld;
uniform vec3 uCamPosKm;
uniform vec2 uTanHalf;   // tan(fov/2)·aspect, tan(fov/2)
uniform float uBlastDustCam;   // blast-raised dust around the camera (0–1): the sky browns out
uniform vec3 uBlastDustColor;
uniform vec4 uBlastFront;      // xyz toward the crater (horizontal), w distance to the approaching front (m)
uniform float uBlastWall;      // dust strength behind that front
uniform samplerCube uClouds;   // render/clouds.ts
uniform float uCloudsOn;
uniform float uT;
varying vec2 vNdc;
${CLOUD_SAMPLE_GLSL}
float ch3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float cvn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch3(i), ch3(i + vec3(1, 0, 0)), f.x), mix(ch3(i + vec3(0, 1, 0)), ch3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ch3(i + vec3(0, 0, 1)), ch3(i + vec3(1, 0, 1)), f.x), mix(ch3(i + vec3(0, 1, 1)), ch3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 rdView = normalize(vec3(vNdc * uTanHalf, -1.0));
  vec3 rd = normalize(uViewToWorld * rdView);
  vec2 ta = raySphere(uCamPosKm, rd, AR);
  if (ta.y <= 0.0) {                       // ray misses the atmosphere: space
    float sunDisc = smoothstep(0.99996, 0.99999, dot(rd, uSunDir));
    // A faint Milky Way: a band of unresolved stars with clumps and a dark dust rift (illustrative).
    vec3 gp = normalize(vec3(-0.4, 0.55, 0.73));
    float b = dot(rd, gp) + 0.025 * (cvn(rd * 11.0) - 0.5);
    float band = exp(-b * b / 0.010);
    float clump = cvn(rd * 9.0) * 0.6 + cvn(rd * 27.0) * 0.4;
    float rift = mix(1.0, 0.25, exp(-pow((b + 0.006) / 0.012, 2.0)) * smoothstep(0.35, 0.65, cvn(rd * 6.0 + 2.0)));
    vec3 mw = vec3(0.72, 0.75, 0.9) * band * (0.35 + clump) * rift * 0.06;
    gl_FragColor = vec4(vec3(sunDisc * 40.0 * uSunScale) + mw, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.a = 1.0;
    return;
  }
  vec2 tp = raySphere(uCamPosKm, rd, PR);
  bool hitsPlanet = tp.x > 0.0 && tp.x < tp.y;
  float t0 = max(0.0, ta.x);
  float t1 = hitsPlanet ? tp.x : ta.y;
  vec3 T;
  vec3 ins = inscatter(uCamPosKm, rd, t0, t1, uSunDir, T);
  if (!hitsPlanet) {
    float sunDisc = smoothstep(0.99996, 0.99999, dot(rd, uSunDir));
    ins += sunDisc * 40.0 * uSunScale * T;
  }
  float avgT = dot(T, vec3(1.0 / 3.0));
  // Clouds overhead, seen from below their base: the baked field for where they are, km-scale billows
  // for their shape, lit from above (dark thick bases, bright thin edges, silver linings near the Sun).
  if (!hitsPlanet && uCloudsOn > 0.0) {
    vec3 up = normalize(uCamPosKm);
    float camAlt = length(uCamPosKm) - PR;
    float below = 1.0 - smoothstep(CLOUD_KM - 2.5, CLOUD_KM - 0.5, camAlt);
    vec2 tc = raySphere(uCamPosKm, rd, PR + CLOUD_KM);
    if (below > 0.0 && tc.y > 0.0) {
      vec3 hp = uCamPosKm + rd * tc.y;
      vec3 cn = normalize(hp);
      vec2 cov = cloudAt(cn);
      vec3 q = cloudDrift(cn) * (PR + CLOUD_KM) / 1.7;
      float d = cvn(q) * 0.5 + cvn(q * 2.3 + 7.1) * 0.3 + cvn(q * 5.3 + 3.7) * 0.2;
      float a = smoothstep(0.3, 0.62, cov.r * 0.85 + (d - 0.5) * 0.95);
      a *= below * uCloudsOn * exp(-tc.y / 110.0) * smoothstep(0.0, 0.08, dot(rd, up));
      if (a > 0.0) {
        float thick = clamp(cov.g * 0.6 + d * 0.6 - 0.1, 0.0, 1.0);
        vec3 cT = sunTransmittance(hp, uSunDir);
        float lit = 0.3 + 0.7 * max(0.0, dot(cn, uSunDir));
        float silver = pow(max(0.0, dot(rd, uSunDir)), 8.0) * (1.0 - thick) * 2.0;
        vec3 cRad = vec3(0.85) * mix(1.0, 0.38, thick) * cT * SUN_E * uSunScale * (lit + silver) / PI * 0.5;
        ins = mix(ins, cRad + ins * 0.3, a);
        avgT *= 1.0 - a;
      }
    }
  }
  float bd = min(0.97, uBlastDustCam * 1.5);
  // The approaching dust wall: rays that reach the front below the top of the ~2 km dust layer.
  if (uBlastFront.w > 0.0 && uBlastWall > 0.0) {
    vec3 up = normalize(uCamPosKm);
    float camAlt = length(uCamPosKm) * 1000.0 - 6371000.0;
    float c = dot(rd, uBlastFront.xyz);
    if (c > 0.0) {
      float sf = uBlastFront.w / c;                       // ray length to the front
      float sv = dot(rd, up);
      float sTop = sv > 0.0 ? (2000.0 - camAlt) / sv : 1e9;
      float path = clamp(min(sTop, sf + 20000.0) - sf, 0.0, 20000.0);
      bd = max(bd, (1.0 - exp(-path * uBlastWall / 1600.0)) * 0.97);
    }
  }
  ins = mix(ins, uBlastDustColor, bd);
  avgT *= 1.0 - bd;
  gl_FragColor = vec4(ins, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.a = hitsPlanet ? 0.0 : avgT;  // blend: src + dst·alpha (stars show through clear air)
}
`;

const starVertex = /* glsl */ `
attribute float mag;
uniform float uPixelRatio;
varying float vBright;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Compressed range (like a long exposure): more of the faint stars show.
  vBright = pow(10.0, -0.4 * mag * 0.62);
  gl_PointSize = clamp(2.2 * uPixelRatio * (0.6 + 0.6 * vBright), 1.0, 4.0 * uPixelRatio);
}
`;

const starFragment = /* glsl */ `
varying float vBright;
uniform float uVisibility;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c));
  gl_FragColor = vec4(vec3(clamp(vBright * 1.8, 0.1, 1.0) * uVisibility * a), 1.0);
}
`;

/** Deterministic PRNG so the star field is identical for everyone (shared links match). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sky {
  readonly stars: Points;
  readonly atmosphere: Mesh;
  private readonly viewToWorld = new Matrix3();
  private readonly camKm = new Vector3();
  readonly skyMaterial: ShaderMaterial;
  private readonly starMaterial: ShaderMaterial;

  constructor(starCount = 6000) {
    const rand = mulberry32(66_040_000);
    const pos = new Float32Array(starCount * 3);
    const mag = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const z = 2 * rand() - 1, a = 2 * Math.PI * rand(), r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 1000, z * 1000, r * Math.sin(a) * 1000], i * 3);
      // Roughly the real magnitude distribution: many faint, few bright (N(<m) ∝ 10^(0.5m)).
      mag[i] = 6.5 + 2 * Math.log10(Math.max(1e-6, rand()));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('mag', new BufferAttribute(mag, 1));
    this.starMaterial = new ShaderMaterial({
      vertexShader: starVertex, fragmentShader: starFragment,
      uniforms: { uPixelRatio: { value: 1 }, uVisibility: { value: 1 } },
      // Not `transparent`: three.js draws transparent objects after opaque ones regardless of
      // renderOrder, and the background must come first.
      depthTest: false, depthWrite: false, blending: AdditiveBlending, transparent: false,
    });
    this.stars = new Points(g, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 0;
    this.stars.name = 'stars';

    const tri = new BufferGeometry();
    tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.skyMaterial = new ShaderMaterial({
      vertexShader: skyVertex, fragmentShader: skyFragment,
      uniforms: {
        uSunDir: { value: new Vector3(1, 0, 0) }, uSunScale: { value: 1 }, uHaze: { value: 0 },
        uViewToWorld: { value: this.viewToWorld }, uCamPosKm: { value: this.camKm }, uTanHalf: { value: [1, 1] },
        uBlastDustCam: { value: 0 }, uBlastDustColor: { value: new Vector3() },
        uBlastFront: { value: new Vector4() }, uBlastWall: { value: 0 },
        uClouds: { value: null }, uCloudsOn: { value: 0 }, uT: { value: 0 },
      },
      depthTest: false, depthWrite: false, transparent: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: SrcAlphaFactor,
    });
    this.atmosphere = new Mesh(tri, this.skyMaterial);
    this.atmosphere.frustumCulled = false;
    this.atmosphere.renderOrder = 1;
    this.atmosphere.name = 'sky';
  }

  update(camera: PerspectiveCamera, sunDir: Vector3, sunScale: number, haze: number, pixelRatio: number): void {
    this.stars.position.copy(camera.position);
    this.stars.updateMatrixWorld();
    this.starMaterial.uniforms.uPixelRatio.value = pixelRatio;
    const u = this.skyMaterial.uniforms;
    (u.uSunDir.value as Vector3).copy(sunDir);
    u.uSunScale.value = sunScale;
    u.uHaze.value = haze;
    this.viewToWorld.setFromMatrix4(camera.matrixWorld);
    this.camKm.copy(camera.position).multiplyScalar(1 / 1000);
    const th = Math.tan((camera.fov * Math.PI) / 360);
    u.uTanHalf.value = [th * camera.aspect, th];
  }
}
