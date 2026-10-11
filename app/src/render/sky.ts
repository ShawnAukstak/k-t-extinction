/**
 * Background: a procedural star field (the real sky of 66 Ma can't be reconstructed — stars have
 * moved too far in 66 Myr) and a full-screen atmosphere pass that scatters sunlight over the stars
 * and around the planet's limb. The globe draws on top with its own aerial perspective.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CustomBlending, Matrix3, Mesh, OneFactor,
  type PerspectiveCamera, Points, ShaderMaterial, SrcAlphaFactor, Vector3,
} from 'three';
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
varying vec2 vNdc;
void main() {
  vec3 rdView = normalize(vec3(vNdc * uTanHalf, -1.0));
  vec3 rd = normalize(uViewToWorld * rdView);
  vec2 ta = raySphere(uCamPosKm, rd, AR);
  if (ta.y <= 0.0) {                       // ray misses the atmosphere: space
    float sunDisc = smoothstep(0.99996, 0.99999, dot(rd, uSunDir));
    gl_FragColor = vec4(vec3(sunDisc * 40.0 * uSunScale), 1.0);
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
  vBright = pow(10.0, -0.4 * mag);
  gl_PointSize = clamp(2.2 * uPixelRatio * (0.6 + 0.6 * vBright), 1.0, 4.0 * uPixelRatio);
}
`;

const starFragment = /* glsl */ `
varying float vBright;
uniform float uVisibility;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c));
  gl_FragColor = vec4(vec3(min(1.0, vBright * 1.6) * uVisibility * a), 1.0);
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
  private readonly skyMaterial: ShaderMaterial;
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
