/**
 * The paleo-globe: a cube-sphere quadtree (terrain/quadtree.ts) whose tiles sample cube-map textures
 * built from the PALEOMAP 65 Ma PaleoDEM by scripts/process_globe.py (colour, normals, elevation),
 * with real heights plus procedural detail close up (terrain/heightfield.ts).
 *
 * Tile geometry is stored relative to each tile's centre so vertex coordinates stay small; three.js
 * composes model-view matrices in float64 on the CPU. Lighting uses world-space
 * unit vectors only; the view ray for aerial perspective is rebuilt from the precise view-space
 * position, so the shader never subtracts two large float32 positions.
 */
import {
  CubeTexture, CubeTextureLoader, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, Matrix3,
  NoColorSpace, type PerspectiveCamera, RGBAFormat, SRGBColorSpace, ShaderMaterial, Vector3,
} from 'three';
import { makeDetailTexture } from '../terrain/detail';
import { Heightfield } from '../terrain/heightfield';
import { Quadtree, type QuadtreeOptions } from '../terrain/quadtree';
import { FACE_NAMES } from './cube';
import { CLOUD_SAMPLE_GLSL, SIMPLEX_GLSL } from './clouds';
import { atmosphereChunk } from './shaders/atmosphere';
import { effectsChunk } from './shaders/effects';

export interface GlobeManifest {
  /** Available face sizes, smallest first, e.g. [256, 1024]. */
  sizes: number[];
  /** Vegetation density/class cube faces for ground-level rendering. */
  vegetation?: { size: number; classes: string[] };
  /** Coarse elevation grid for CPU queries. */
  elevationGrid?: { file: string; width: number; height: number; stepDeg: number };
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
attribute float height;
attribute vec2 detail;
varying vec2 vDetail;
varying vec3 vDir;
varying vec3 vViewPos;
varying vec3 vGeoNormal;
varying float vHeight;
void main() {
  vDir = dir;
  vGeoNormal = normal;   // world space (tiles are only translated)
  vHeight = height;
  vDetail = detail;
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
uniform sampler2D uDetail;
uniform samplerCube uVeg;
uniform float uHasVeg;
uniform samplerCube uClouds;
uniform float uCloudsOn;
uniform float uTime;            // wall-clock seconds (waves)
varying vec2 vDetail;
varying vec3 vDir;
varying vec3 vViewPos;
varying vec3 vGeoNormal;
varying float vHeight;

// Simplex noise (render/clouds.ts) for the landscape mosaic seen from mid altitudes.
${SIMPLEX_GLSL}

// Clouds (render/clouds.ts): drift with the zonal winds for the first days, then hold.
${CLOUD_SAMPLE_GLSL}
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
  // Close up, the terrain mesh is finer than the textures: take relief and coastline from geometry.
  float distKm0 = length(vViewPos) / 1000.0;
  float close = 1.0 - smoothstep(60.0, 600.0, distKm0);
  if (close > 0.0) {
    nrm = normalize(mix(nrm, normalize(vGeoNormal), close));
    elev = mix(elev, vHeight, close);
  }
  float water = 1.0 - smoothstep(-20.0 * (1.0 - close) - 1.0, 20.0 * (1.0 - close) + 1.0, elev);

  // Ground-level detail: tiling noise at 512 m … 8 m, each scale fading in as it becomes resolvable.
  if (close > 0.0 && water < 0.5) {
    float trees = uHasVeg > 0.5 ? textureCube(uVeg, n).r : 0.5;
    vec3 dn = vec3(0.0);
    float shade = 0.0;
    float wsum = 0.0;
    for (int k = 0; k < 5; k++) {
      float scale = 512.0 / pow(4.0, float(k));
      float w = 1.0 - smoothstep(scale * 30.0, scale * 120.0, distKm0 * 1000.0);
      if (w <= 0.0) continue;
      vec4 d = texture2D(uDetail, vDetail / scale);
      shade += (d.r - 0.5) * w * (k == 1 ? 1.4 : 1.0);
      dn += vec3(d.g - 0.5, d.b - 0.5, 0.0) * w;
      wsum += w;
    }
    // Forest canopy reads as darker clumps; open ground as lighter patches.
    float canopy = trees * smoothstep(0.45, 0.6, texture2D(uDetail, vDetail / 32.0).a);
    albedo *= 1.0 + 0.45 * shade - 0.35 * canopy * close;
    // The forest floor where plants are drawn (within ~1.5 km): no grass in the Cretaceous, so leaf
    // litter, bare soil, mosses, and fern and horsetail ground cover in the open, instead of the
    // canopy colour the map shows from above.
    float floorK = (1.0 - smoothstep(600.0, 1800.0, distKm0 * 1000.0)) * smoothstep(0.02, 0.2, trees + 0.1);
    if (floorK > 0.0) {
      vec4 f1 = texture2D(uDetail, vDetail / 8.0), f2 = texture2D(uDetail, vDetail / 2.0 + 0.37);
      // Drier, sparser country (low plant density) has more bare ground, coloured like the map there.
      float lush = smoothstep(0.08, 0.45, trees);
      vec3 litter = mix(vec3(0.085, 0.062, 0.04), vec3(0.13, 0.1, 0.065), f2.r);
      vec3 soil = mix(albedo * 0.85, vec3(0.11, 0.085, 0.06), lush);
      litter = mix(soil, litter, lush);
      vec3 ferns = mix(vec3(0.05, 0.08, 0.028), vec3(0.08, 0.11, 0.035), f1.a);
      float green = smoothstep(0.3, 0.5, f1.r * 0.6 + f2.a * 0.4 + 0.15 * (1.0 - trees)) * mix(0.3, 1.0, lush);
      vec3 floorC = mix(mix(litter, soil, smoothstep(0.6, 0.8, f2.r) * 0.5), ferns, green);
      albedo = mix(albedo, floorC * (0.85 + 0.3 * shade), floorK);
    }
    // Perturb the normal in the tangent plane (east/north from the geometry normal).
    vec3 gn = normalize(vGeoNormal);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), gn) + vec3(1e-5, 0.0, 0.0));
    vec3 north = cross(gn, east);
    nrm = normalize(nrm + (east * dn.x + north * dn.y) * 1.2 * close);
  }

  // From a few km to a few hundred km up, vegetated land is a mosaic of forest stands (darker) and open
  // fern and horsetail ground (paler), finer than the map can show.
  float mosaicK = (1.0 - smoothstep(80.0, 500.0, distKm0)) * smoothstep(0.5, 6.0, distKm0) * (1.0 - water);
  if (mosaicK > 0.0) {
    float trees = uHasVeg > 0.5 ? textureCube(uVeg, n).r : 0.5;
    vec3 P = n * PR;
    float f = snoise(P / 16.0) * 0.5 + snoise(P / 5.0 + 7.0) * 0.32 + snoise(P / 1.5 + 3.0) * 0.18;
    float stand = smoothstep(-0.25, 0.3, f) * smoothstep(0.05, 0.4, trees);
    vec3 forest = albedo * vec3(0.72, 0.8, 0.68);
    vec3 open = albedo * vec3(1.18, 1.12, 0.95);
    albedo = mix(albedo, mix(open, forest, stand), mosaicK * smoothstep(0.03, 0.2, trees));
  }

  // Impact effects on the surface (crater, ejecta blanket, flooding).
  float fxAng = fxAngle(n);
  float rKm = fxAng * PR;
  fxSurface(rKm, fxAng, n, albedo, water, nrm);

  // Impact winter: less sunlight under the aerosol veil, snow and sea ice where it freezes,
  // plants dying back and (much later) recovering.
  vec3 winter = fxWinter(n);
  fxLife(albedo, water);
  // Only the impact's cooling makes snow and ice (the pre-impact world had no ice caps).
  float cooled = smoothstep(-2.0, -6.0, winter.z);
  float snow = (1.0 - water) * smoothstep(-1.0, -8.0, winter.y) * cooled;
  float seaIce = water * smoothstep(-1.8, -6.0, winter.y) * cooled;
  albedo = mix(albedo, vec3(0.78, 0.80, 0.84), max(snow, seaIce) * 0.9);
  water *= 1.0 - seaIce;

  vec3 L = uSunDir;
  vec3 pKm = n * (PR + max(elev, 0.0) / 1000.0);
  vec3 sunT = sunTransmittance(pKm + n * 0.05, L) * winter.x;
  // Clouds fade out as the camera comes down to their level (no parallax on a painted layer).
  float camAltC = length(uCamPosKm) * 1000.0 - 6371000.0;
  float clouds = uCloudsOn * smoothstep(9000.0, 30000.0, camAltC) * (1.0 - 0.7 * uOverlay);
  vec2 cl = vec2(0.0);
  if (clouds > 0.0) {
    cl = cloudAt(n);
    // Shadow: the cloud the sunbeam to this point passes through, CLOUD_KM up.
    float sl = max(0.08, dot(n, L));
    vec3 sp = normalize(n + (L - n * dot(n, L)) * (CLOUD_KM / PR) / sl);
    sunT *= 1.0 - 0.75 * clouds * cloudAt(sp).r;
  }
  float ndl = max(0.0, dot(nrm, L));
  // Sky fill: a little blue light on the day side, fading through twilight.
  float dayness = smoothstep(-0.15, 0.25, dot(n, L));
  vec3 sky = vec3(0.05, 0.075, 0.11) * dayness * uSunScale * winter.x;
  vec3 radiance = albedo * (sunT * SUN_E * uSunScale * ndl / PI + sky) + albedo * 0.0008;

  vec3 rd = normalize(uViewToWorld * vViewPos);
  // Water: wind waves as scrolling noise normals at five scales (two directions each, moving at the
  // deep-water speed of their wavelength; all scales divide the detail period, so they tile), sun
  // glitter that widens into a broad glint where waves are smaller than a pixel, and Fresnel reflection
  // of the sky. Waves move in wall-clock time so they look right at any playback speed.
  if (water > 0.0) {
    vec3 V = -rd;
    float pxM = length(vViewPos) * 0.0015;
    vec3 gn = n;
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), gn) + vec3(1e-5, 0.0, 0.0));
    vec3 north = cross(gn, east);
    vec2 slope = vec2(0.0);
    for (int i = 0; i < 5; i++) {
      float S = 512.0 / pow(4.0, float(i));
      float c = sqrt(9.81 * S * 0.2 / 6.2831853);           // speed of waves ~S/5 long
      vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.45, 0.9);
      vec4 a = texture2D(uDetail, (vDetail + d1 * c * uTime) / S);
      vec4 b = texture2D(uDetail, (vDetail + d2 * c * uTime * 0.8) / S + 0.31);
      float amp = 0.4 * (1.0 - smoothstep(S * 0.02, S * 0.15, pxM));
      slope += (vec2(a.g, a.b) + vec2(b.g, b.b) - 1.0) * amp;
    }
    vec3 wn = normalize(gn - east * slope.x - north * slope.y);
    float rough = smoothstep(0.5, 40.0, pxM);
    vec3 H = normalize(L + V);
    float nh = max(0.0, dot(wn, H));
    float spec = mix(pow(nh, 1500.0) * 0.8, pow(nh, 160.0) * 0.022, rough) + pow(nh, 40.0) * 0.002;
    float fres = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(wn, V)), 5.0);
    vec3 R = reflect(rd, wn);
    float elev = clamp(dot(R, gn), 0.0, 1.0);
    vec3 skyC = mix(vec3(0.13, 0.16, 0.2), vec3(0.04, 0.07, 0.14), sqrt(elev)) * dayness * sunT * SUN_E * uSunScale / PI;
    radiance = mix(radiance, skyC, water * fres * 0.6);
    radiance += water * sunT * SUN_E * uSunScale * spec * smoothstep(0.0, 0.1, dot(n, L));
  }

  // Tsunami crest and churned water (only on the sea).
  vec4 tsu = fxTsunami(n);
  if (water > 0.5 && tsu.w + tsu.x > 0.0) {
    vec3 sunlit = sunT * SUN_E * uSunScale * max(0.0, dot(n, L)) / PI;
    // Crest: foam line. Behind it: sediment-laden water (the wave scours the seafloor; Range 2022).
    radiance += sunlit * (vec3(0.50, 0.56, 0.56) * tsu.x * 0.22 + vec3(0.075, 0.07, 0.055) * tsu.y * 0.45);
    radiance += fxTsunamiOverlay(tsu) * water * 1.5;
  }

  // Cloud tops, lit from above: white where thick, a little blue-grey at thin edges; the side
  // facing away from the Sun (gradient of cover toward the Sun) a touch darker.
  if (clouds > 0.0 && cl.r > 0.002) {
    vec3 Lt = L - n * dot(n, L);
    float toward = cloudAt(normalize(n + Lt * 0.004)).r - cl.r;
    float relief = clamp(1.0 - 1.6 * toward, 0.55, 1.15);
    vec3 cT = sunTransmittance(n * (PR + CLOUD_KM), L) * winter.x;
    float cdl = max(0.0, dot(n, L));
    vec3 cAlb = mix(vec3(0.58, 0.62, 0.68), vec3(0.86, 0.87, 0.88), cl.g);
    vec3 cRad = cAlb * (cT * SUN_E * uSunScale * (cdl * relief + 0.04 * smoothstep(-0.1, 0.1, dot(n, L))) / PI + sky * 1.4);
    radiance = mix(radiance, cRad, cl.r * clouds);
  }

  // Ejecta/dust cloud above the surface: hides the ground, lit by the Sun where it's day.
  float tau = fxDustTau(fxAng, n);
  float cover = 0.92 * (1.0 - exp(-tau));
  vec3 emission = fxEmission(rKm, fxAng);
  if (tau > 0.0) {
    vec3 dustLit = vec3(0.085, 0.07, 0.055) * (sunTransmittance(n * (PR + 30.0), L) * SUN_E * uSunScale * max(0.0, dot(n, L) + 0.1) / PI);
    radiance = mix(radiance, dustLit, cover);
  }
  // The stratospheric veil seen from above: black for soot, white for sulfate, tan for dust.
  float veil = (1.0 - winter.x) * 0.9;
  if (veil > 0.0) {
    vec3 veilLit = uVeil * sunTransmittance(n * (PR + 25.0), L) * SUN_E * uSunScale * max(0.0, dot(n, L) + 0.05) / PI;
    radiance = mix(radiance, veilLit, veil);
  }
  // Ground glow is hidden under the cloud; the fireball and re-entry glow are in or above it.
  radiance += emission * mix(1.0, 0.35, cover);
  float pxKm = length(vViewPos) / 1000.0 * 0.0015;
  radiance += fxOverlay(rKm, fxAng, pxKm) * 3.0;
  radiance += fxPickRing(n, pxKm);

  // Dust raised by the air blast, over land (see fxBlastDust). Seen from above the ~2 km layer it
  // sits under the haze and is lit where it is; from inside it, it is the nearest thing to the eye.
  float bdHere = fxBlastDust(fxAng) * (1.0 - water);
  float camAlt = length(uCamPosKm) * 1000.0 - 6371000.0;
  if (camAlt >= 2000.0 && bdHere > 0.0) {
    vec3 blastLit = vec3(0.34, 0.27, 0.2) * sunTransmittance(n * (PR + 1.0), L) * SUN_E * uSunScale * max(0.0, dot(n, L) + 0.05) / PI;
    radiance = fxBlastFog(radiance, length(vViewPos), bdHere, rd, n, camAlt, blastLit);
  }

  // Aerial perspective between the camera and this point. End the integral where the view ray
  // meets the true sphere: the flat triangles of a coarse mesh dip up to ~1 km below it, and
  // integrating that far into the densest air draws the mesh grid into the haze.
  float distKm = length(vViewPos) / 1000.0;
  vec2 ts = raySphere(uCamPosKm, rd, PR + max(elev, 0.0) / 1000.0);
  if (close < 0.5 && ts.x > 0.0 && ts.x < ts.y) distKm = min(distKm, ts.x);
  vec2 ta = raySphere(uCamPosKm, rd, AR);
  vec3 T = vec3(1.0);
  vec3 ins = vec3(0.0);
  if (ta.y > 0.0) {
    float t0 = max(0.0, ta.x);
    float t1 = min(distKm, ta.y);
    if (t1 > t0) ins = inscatter(uCamPosKm, rd, t0, t1, L, T);
  }
  // Haze is scaled down a little from the physical value so the ground stays readable from orbit.
  // Under a soot layer the lower atmosphere is dark too; only the air above it stays lit.
  vec3 col = radiance * T + ins * 0.33 * mix(0.2, 1.0, winter.x);
  if (camAlt < 2000.0) col = fxBlastFog(col, length(vViewPos), bdHere, rd, n, camAlt, uBlastDustColor);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

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
  private elevation: Int16Array | null = null;
  loadedSize = 0;
  private readonly viewToWorld = new Matrix3();
  private readonly camKm = new Vector3();
  readonly heights = new Heightfield({ offset: 128, step: 40 });
  readonly terrain: Quadtree;
  /** Called once terrain heights are available (e.g. to lift the camera off the ground). */
  onHeights: (() => void) | null = null;
  /** Anisotropic filtering for the surface textures (sharp ground at grazing angles); set before load. */
  anisotropy = 1;

  constructor(terrain: QuadtreeOptions, extraUniforms: Record<string, { value: unknown }> = {}) {
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
        uDetail: { value: makeDetailTexture() },
        uVeg: { value: placeholderCube() },
        uHasVeg: { value: 0 },
        uClouds: { value: placeholderCube() },
        uCloudsOn: { value: 0 },
        uTime: { value: 0 },
        uSunDir: { value: new Vector3(1, 0, 0) },
        uSunScale: { value: 1 },
        uHaze: { value: 0 },
        uViewToWorld: { value: this.viewToWorld },
        uCamPosKm: { value: this.camKm },
        ...extraUniforms,
      },
    });
    this.terrain = new Quadtree(this.material, this.heights, terrain);
    this.group.add(this.terrain.group);
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
    if (m.elevationGrid) {
      fetch(`${baseUrl}/${m.elevationGrid.file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((b) => { this.elevation = new Int16Array(b); })
        .catch((e) => console.warn('elevation grid unavailable', e));
    }
    const sizes = m.sizes.filter((s) => s <= targetSize);
    const first = sizes[0] ?? m.sizes[0];
    await this.loadSize(baseUrl, first);
    const best = sizes[sizes.length - 1];
    if (best && best > first) {
      void this.loadSize(baseUrl, best).then(() => onUpgrade?.(best));
    }
    // Vegetation density/class faces (512) for ground shading.
    if (m.vegetation) {
      new CubeTextureLoader().loadAsync(FACE_NAMES.map((f) => `${baseUrl}/${m.vegetation!.size}/veg_${f}.png`)).then((veg) => {
        veg.colorSpace = NoColorSpace;
        veg.needsUpdate = true;
        this.material.uniforms.uVeg.value = veg;
        this.material.uniforms.uHasVeg.value = 1;
      }).catch((e) => console.warn('vegetation map unavailable', e));
    }
    // Heights for the terrain mesh (CPU); rebuild tiles once they arrive.
    this.heights.decode.offset = m.height.offset;
    this.heights.decode.step = m.height.step;
    void this.heights.load(baseUrl, best ?? first).then(() => {
      this.terrain.invalidate();
      this.onHeights?.();
    });
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
      t.anisotropy = this.anisotropy;
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

  /** Paleo-elevation (m, negative = sea depth) from the 0.5° grid, or null before it loads. */
  elevationAt(lat: number, lon: number): number | null {
    const g = this.manifest?.elevationGrid;
    if (!g || !this.elevation) return null;
    const i = Math.min(g.height - 1, Math.max(0, Math.floor((90 - lat) / g.stepDeg)));
    const j = Math.floor(((((lon + 180) % 360) + 360) % 360) / g.stepDeg) % g.width;
    return this.elevation[i * g.width + j];
  }

  update(camera: PerspectiveCamera, sunDir: Vector3, sunScale: number, haze: number, viewportHeight = 800): void {
    this.terrain.update(camera, viewportHeight);
    const u = this.material.uniforms;
    (u.uSunDir.value as Vector3).copy(sunDir);
    u.uSunScale.value = sunScale;
    u.uHaze.value = haze;
    this.viewToWorld.setFromMatrix4(camera.matrixWorld);
    this.camKm.copy(camera.position).multiplyScalar(1 / 1000);
  }
}
