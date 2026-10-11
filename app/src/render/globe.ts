/**
 * The paleo-globe: a cube-sphere whose six faces sample cube-map textures built from the
 * PALEOMAP 65 Ma PaleoDEM by scripts/process_globe.py (colour, normals, elevation).
 *
 * Geometry for each face is stored relative to the face's centre so vertex coordinates stay
 * small; three.js composes model-view matrices in float64 on the CPU. Lighting uses world-space
 * unit vectors only; the view ray for aerial perspective is rebuilt from the precise view-space
 * position, so the shader never subtracts two large float32 positions.
 */
import {
  BufferAttribute, BufferGeometry, CubeTexture, CubeTextureLoader, DataTexture, Group, LinearFilter,
  LinearMipmapLinearFilter, Matrix3, Mesh, NoColorSpace, type PerspectiveCamera, RGBAFormat, SRGBColorSpace,
  ShaderMaterial, Vector3,
} from 'three';
import { EARTH_RADIUS } from '../config';
import { faceDirection, FACE_NAMES } from './cube';
import { atmosphereChunk } from './shaders/atmosphere';
import { effectsChunk } from './shaders/effects';

export interface GlobeManifest {
  /** Available face sizes, smallest first, e.g. [256, 1024]. */
  sizes: number[];
  /** Elevation decode for the 8-bit height faces: metres = (v·255 − offset) · step. */
  height: { offset: number; step: number };
  /** Normal-map vertical exaggeration baked into the normals (for the info panel). */
  normalExaggeration: number;
  source: string;
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 dir;
varying vec3 vDir;
varying vec3 vViewPos;
void main() {
  vDir = dir;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${atmosphereChunk}
${effectsChunk}
uniform samplerCube uColor;
uniform samplerCube uNormal;
uniform samplerCube uHeight;
uniform vec2 uHeightDecode;     // (offset, step)
uniform mat3 uViewToWorld;
uniform vec3 uCamPosKm;
uniform float uHasData;
varying vec3 vDir;
varying vec3 vViewPos;

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vDir);
  vec3 albedo;
  vec3 nrm;
  float elev;
  if (uHasData > 0.5) {
    albedo = textureCube(uColor, n).rgb;
    nrm = normalize(textureCube(uNormal, n).xyz * 2.0 - 1.0);
    elev = (textureCube(uHeight, n).r * 255.0 - uHeightDecode.x) * uHeightDecode.y;
  } else {
    albedo = vec3(0.02, 0.05, 0.12);
    nrm = n;
    elev = -4000.0;
  }
  float water = 1.0 - smoothstep(-20.0, 20.0, elev);

  // Impact effects on the surface (crater, ejecta blanket, flooding).
  float fxAng = fxAngle(n);
  float rKm = fxAng * PR;
  fxSurface(rKm, fxAng, n, albedo, water, nrm);

  vec3 L = uSunDir;
  vec3 pKm = n * (PR + max(elev, 0.0) / 1000.0);
  vec3 sunT = sunTransmittance(pKm + n * 0.05, L);
  float ndl = max(0.0, dot(nrm, L));
  // Sky fill: a little blue light on the day side, fading through twilight.
  float dayness = smoothstep(-0.15, 0.25, dot(n, L));
  vec3 sky = vec3(0.05, 0.075, 0.11) * dayness * uSunScale;
  vec3 radiance = albedo * (sunT * SUN_E * uSunScale * ndl / PI + sky) + albedo * 0.0008;

  vec3 rd = normalize(uViewToWorld * vViewPos);
  // Sun glint on water: a tight lobe (Blinn–Phong) plus Fresnel sky reflection.
  if (water > 0.0) {
    vec3 V = -rd;
    vec3 H = normalize(L + V);
    float nh = max(0.0, dot(n, H));
    float spec = pow(nh, 2500.0) * 0.6 + pow(nh, 200.0) * 0.012;
    float fres = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(n, V)), 5.0);
    radiance += water * sunT * SUN_E * uSunScale * (spec * smoothstep(0.0, 0.1, dot(n, L)) + fres * 0.01 * ndl);
  }

  // Ejecta/dust cloud above the surface: hides the ground, lit by the Sun where it's day.
  float tau = fxDustTau(fxAng, n);
  float cover = 0.92 * (1.0 - exp(-tau));
  vec3 emission = fxEmission(rKm, fxAng);
  if (tau > 0.0) {
    vec3 dustLit = vec3(0.085, 0.07, 0.055) * (sunTransmittance(n * (PR + 30.0), L) * SUN_E * uSunScale * max(0.0, dot(n, L) + 0.1) / PI);
    radiance = mix(radiance, dustLit, cover);
  }
  // Ground glow is hidden under the cloud; the fireball and re-entry glow are in or above it.
  radiance += emission * mix(1.0, 0.35, cover);
  float pxKm = length(vViewPos) / 1000.0 * 0.0015;
  radiance += fxOverlay(rKm, fxAng, pxKm) * 3.0;

  // Aerial perspective between the camera and this point. End the integral where the view ray
  // meets the true sphere: the flat triangles of a coarse mesh dip up to ~1 km below it, and
  // integrating that far into the densest air draws the mesh grid into the haze.
  float distKm = length(vViewPos) / 1000.0;
  vec2 ts = raySphere(uCamPosKm, rd, PR + max(elev, 0.0) / 1000.0);
  if (ts.x > 0.0 && ts.x < ts.y) distKm = min(distKm, ts.x);
  vec2 ta = raySphere(uCamPosKm, rd, AR);
  vec3 T = vec3(1.0);
  vec3 ins = vec3(0.0);
  if (ta.y > 0.0) {
    float t0 = max(0.0, ta.x);
    float t1 = min(distKm, ta.y);
    if (t1 > t0) ins = inscatter(uCamPosKm, rd, t0, t1, L, T);
  }
  // Haze is scaled down a little from the physical value so the ground stays readable from orbit.
  gl_FragColor = vec4(radiance * T + ins * 0.4, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** One cube face as a grid, with positions relative to the face centre. */
function buildFace(face: number, segments: number): BufferGeometry {
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const dirs = new Float32Array(n * n * 3);
  const centre = faceDirection(face, 0.5, 0.5).multiplyScalar(EARTH_RADIUS);
  const d = new Vector3();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      faceDirection(face, i / segments, j / segments, d);
      const k = (j * n + i) * 3;
      dirs[k] = d.x; dirs[k + 1] = d.y; dirs[k + 2] = d.z;
      pos[k] = d.x * EARTH_RADIUS - centre.x;
      pos[k + 1] = d.y * EARTH_RADIUS - centre.y;
      pos[k + 2] = d.z * EARTH_RADIUS - centre.z;
    }
  }
  // Winding: make the first triangle face outward, then use the same order for all.
  const a = faceDirection(face, 0, 0), b = faceDirection(face, 1 / segments, 0), c = faceDirection(face, 0, 1 / segments);
  const outward = b.clone().sub(a).cross(c.clone().sub(a)).dot(a) > 0;
  const idx = new Uint32Array(segments * segments * 6);
  let q = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const i0 = j * n + i, i1 = i0 + 1, i2 = i0 + n, i3 = i2 + 1;
      if (outward) { idx.set([i0, i1, i2, i1, i3, i2], q); } else { idx.set([i0, i2, i1, i1, i2, i3], q); }
      q += 6;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('dir', new BufferAttribute(dirs, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.boundingSphere = null;
  g.computeBoundingSphere();
  return g;
}

function placeholderCube(): CubeTexture {
  const px = new Uint8Array([0, 0, 0, 255]);
  // three.js uploads a cube of DataTextures from each face's .image (see WebGLTextures.uploadCubeTexture).
  const tex = new CubeTexture(FACE_NAMES.map(() => new DataTexture(px, 1, 1, RGBAFormat)));
  tex.needsUpdate = true;
  return tex;
}

export class Globe {
  readonly group = new Group();
  readonly material: ShaderMaterial;
  manifest: GlobeManifest | null = null;
  loadedSize = 0;
  private readonly viewToWorld = new Matrix3();
  private readonly camKm = new Vector3();

  constructor(segments = 64, extraUniforms: Record<string, { value: unknown }> = {}) {
    this.group.name = 'globe';
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColor: { value: placeholderCube() },
        uNormal: { value: placeholderCube() },
        uHeight: { value: placeholderCube() },
        uHeightDecode: { value: [128, 40] },
        uHasData: { value: 0 },
        uSunDir: { value: new Vector3(1, 0, 0) },
        uSunScale: { value: 1 },
        uHaze: { value: 0 },
        uViewToWorld: { value: this.viewToWorld },
        uCamPosKm: { value: this.camKm },
        ...extraUniforms,
      },
    });
    for (let f = 0; f < 6; f++) {
      const mesh = new Mesh(buildFace(f, segments), this.material);
      mesh.position.copy(faceDirection(f, 0.5, 0.5).multiplyScalar(EARTH_RADIUS));
      mesh.name = `globe-face-${FACE_NAMES[f]}`;
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
  }

  /** Load the manifest and the smallest face size, then upgrade to `targetSize` in the background. */
  async load(baseUrl: string, targetSize: number, onUpgrade?: (size: number) => void): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/manifest.json`);
      if (!res.ok) return false;
      this.manifest = (await res.json()) as GlobeManifest;
    } catch {
      return false;
    }
    const m = this.manifest;
    this.material.uniforms.uHeightDecode.value = [m.height.offset, m.height.step];
    const sizes = m.sizes.filter((s) => s <= targetSize);
    const first = sizes[0] ?? m.sizes[0];
    await this.loadSize(baseUrl, first);
    const best = sizes[sizes.length - 1];
    if (best && best > first) {
      void this.loadSize(baseUrl, best).then(() => onUpgrade?.(best));
    }
    return true;
  }

  private async loadSize(baseUrl: string, size: number): Promise<void> {
    const loader = new CubeTextureLoader();
    const load = (kind: string, ext: string) =>
      loader.loadAsync(FACE_NAMES.map((f) => `${baseUrl}/${size}/${kind}_${f}.${ext}`));
    const [color, normal, height] = await Promise.all([load('color', 'webp'), load('normal', 'webp'), load('height', 'png')]);
    color.colorSpace = SRGBColorSpace;
    normal.colorSpace = NoColorSpace;
    height.colorSpace = NoColorSpace;
    for (const t of [color, normal]) {
      t.generateMipmaps = true;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.needsUpdate = true;
    }
    height.generateMipmaps = true;
    height.minFilter = LinearMipmapLinearFilter;
    height.needsUpdate = true;
    const u = this.material.uniforms;
    (u.uColor.value as CubeTexture).dispose();
    (u.uNormal.value as CubeTexture).dispose();
    (u.uHeight.value as CubeTexture).dispose();
    u.uColor.value = color;
    u.uNormal.value = normal;
    u.uHeight.value = height;
    u.uHasData.value = 1;
    this.loadedSize = size;
  }

  update(camera: PerspectiveCamera, sunDir: Vector3, sunScale: number, haze: number): void {
    const u = this.material.uniforms;
    (u.uSunDir.value as Vector3).copy(sunDir);
    u.uSunScale.value = sunScale;
    u.uHaze.value = haze;
    this.viewToWorld.setFromMatrix4(camera.matrixWorld);
    this.camKm.copy(camera.position).multiplyScalar(1 / 1000);
  }
}
