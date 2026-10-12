/**
 * Plants near the ground: instanced low-poly trees, palms, tree ferns, cycads and shrubs in ~600 m
 * cells around the camera, chosen from the baked vegetation map (density, class, temperature).
 *
 * They respond to the impact using the same physics as the rest of the app:
 *   - air blast (Collins et al. 2005): trees fall away from the crater when the front arrives where
 *     the scaling-law wind exceeds the blow-down threshold (~62 m/s, EIEP), lean where it is lower;
 *   - fireball heat: foliage chars where the radiant exposure exceeds the EIEP ignition threshold;
 *   - impact winter: plants die back, then ferns, then forests return (uLife), snow where it froze.
 * Placement is deterministic (hashed per cell) so every viewer sees the same forest.
 */
import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, type PerspectiveCamera, Quaternion,
  ShaderMaterial, Vector3,
} from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { centralAngle, vecToLatLon } from '../core/geo';
import { atDistance, type CraterResult } from '../physics/eiep';
import { cellsAround, directionToFace, faceDirection, FACE_NAMES } from '../render/cube';
import { atmosphereChunk } from '../render/shaders/atmosphere';
import { effectsChunk } from '../render/shaders/effects';
import type { Heightfield } from './heightfield';
import { simplex3 } from './noise';
import { makeFoliageAtlas } from './foliage-atlas';
import { plantGeometry, plantMix, type PlantKind, type PlantLod } from './plants';

const KINDS: PlantKind[] = ['conifer', 'araucaria', 'broadleaf', 'palm', 'treefern', 'cycad', 'shrub', 'fern', 'horsetail'];
const CELL_LEVEL = 14; // ~611 m cells
const COVER_LEVEL = 18; // ~38 m cells for the dense ground cover near the camera

export interface VegetationOptions {
  /** Cells either side of the camera's cell (desktop 2 → 5×5). */
  radiusCells: number;
  /** Mean spacing between plants at full density, m. */
  spacing: number;
  /** Only grow plants when the camera is lower than this, m. */
  maxAltitude: number;
  buildsPerFrame: number;
  /** Ground cover (small ferns and horsetails) near the camera: cells either side, clumps per ~38 m cell. */
  coverCells: number;
  coverPerCell: number;
  /** Where the vegetation map lives (…/data/globe) and its face size. */
  baseUrl: string;
  mapSize: number;
}

/** Vegetation classes, in the order scripts/process_globe.py writes them. */
export const VEG_CLASSES = ['water', 'desert', 'arid_shrub', 'fern_savanna', 'tropical_forest', 'warm_forest', 'cool_forest', 'wetland', 'rock'];

/**
 * Openness of the ground (0 = closed canopy, 1 = clearing): large-scale noise so forests are a mosaic
 * of stands and open fern/horsetail ground, as floodplain vegetation is. Shared with the herds, which
 * graze in the open.
 */
export function clearing(d: Vector3): number {
  const x = d.x * EARTH_RADIUS, y = d.y * EARTH_RADIUS, z = d.z * EARTH_RADIUS;
  const n = 0.65 * simplex3(x / 420, y / 420, z / 420) + 0.35 * simplex3(x / 130 + 9, y / 130, z / 130);
  return Math.min(1, Math.max(0, (n + 0.15) * 2.2));
}

export class VegetationMap {
  private faces: Uint8Array[] = [];
  private size = 0;
  ready = false;

  async load(baseUrl: string, size: number): Promise<void> {
    this.faces = await Promise.all(FACE_NAMES.map(async (f) => {
      const blob = await (await fetch(`${baseUrl}/${size}/veg_${f}.png`)).blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
      const ctx = (c as HTMLCanvasElement).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      bmp.close();
      return new Uint8Array(d.buffer);
    }));
    this.size = size;
    this.ready = true;
  }

  /** (tree density 0–1, class name, temperature °C) — nearest texel. */
  sample(d: Vector3): { density: number; cls: string; tempC: number } {
    if (!this.ready) return { density: 0, cls: 'water', tempC: 20 };
    const { face, s, t } = directionToFace(d);
    const n = this.size;
    const x = Math.min(n - 1, Math.max(0, Math.floor(s * n))), y = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
    const k = (y * n + x) * 4;
    const f = this.faces[face];
    return { density: f[k] / 255, cls: VEG_CLASSES[f[k + 1]] ?? 'water', tempC: f[k + 2] / 4 - 20 };
  }
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
${atmosphereChunk}
${effectsChunk}
attribute float part;         // 0 wood, 1 foliage
attribute float pioneer;      // 1 for plants that recolonise first (ferns, shrubs, tree ferns, cycads, horsetails)
attribute vec3 aCrown;        // the crown's volume normal (soft lighting for cards)
attribute float aAO;          // occlusion inside the crown
attribute vec4 aInst;         // x variation, y heat exposure / ignition, z blast arrival (s), w blast wind (m/s)
uniform vec3 uCamPosKm;
uniform vec3 uFogColor;
uniform float uFadeM;         // distance over which plants are drawn (fades out over the last quarter)
varying vec2 vUv;
varying vec3 vBase;
varying vec3 vN;
varying vec3 vC;
varying vec3 vUp;
varying float vAO;
varying float vFoliage;
varying float vLeafLoss;
varying vec3 vSunT;
varying vec3 vSky;
varying vec3 vFogA;
varying vec3 vFogB;
varying vec3 vView;
varying float vFade;

vec3 rotateAxis(vec3 v, vec3 k, float a) {
  return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a));
}

void main() {
  vec4 rel4 = instanceMatrix * vec4(position, 1.0);        // cell-relative, world-aligned (small numbers)
  vec3 base = instanceMatrix[3].xyz;
  vec3 cellWorld = modelMatrix[3].xyz;                     // cell centre (float32 is fine for directions)
  vec3 up = normalize(cellWorld + base);
  vec3 rel = rel4.xyz - base;
  vec3 nrm = normalize(mat3(instanceMatrix) * normal);
  vec3 crown = normalize(mat3(instanceMatrix) * aCrown);

  // Fate: killed by the fireball's heat, flattened by the air blast, or by the impact winter (the
  // scenario's severity sets what fraction). Then dead crowns drop their leaves, standing trunks fall
  // within decades, the logs rot, and a new plant grows in the same spot, on the fern-spike curve for
  // pioneers (ferns, shrubs, tree ferns, cycads) and the forest-recovery curve for trees.
  float yrs = max(0.0, uT) / 31557600.0;
  float r2 = fract(aInst.x * 97.31 + 0.17), r3 = fract(aInst.x * 31.77 + 0.53);
  bool foliage = part > 0.5;
  float burnt = uT > 12.0 ? smoothstep(0.9, 1.3, aInst.y) : 0.0;
  float flatten = 0.0, bend = 0.0;
  if (uT > aInst.z && aInst.w > 30.0) {
    float k = smoothstep(aInst.z, aInst.z + 4.0 + 3.0 * aInst.x, uT);
    if (aInst.w > 62.0) flatten = k; else bend = k * 0.35 * smoothstep(30.0, 62.0, aInst.w);
  }
  float frozen = smoothstep(r2 * 0.85, r2 * 0.85 + 0.15, uLife.x);
  float dead = max(max(burnt, flatten), frozen);
  float grow = dead > 0.0 ? smoothstep(r3 * 0.8, r3 * 0.8 + 0.2, mix(uLife.z, uLife.y, pioneer)) : 0.0;

  vec3 leaf = mix(vec3(0.04, 0.075, 0.03), vec3(0.075, 0.105, 0.038), aInst.x);
  vec3 bark = vec3(0.085, 0.066, 0.048) * (0.8 + 0.4 * r2);
  vec3 c = foliage ? leaf : bark;
  vLeafLoss = 0.0;
  if (grow > 0.0) {
    rel *= grow; // the replacement: upright, green, growing
  } else {
    if (foliage) {
      // Survivors yellow under the veil; the dead brown and lose their leaves within a year or two;
      // burnt foliage is gone at once.
      c = mix(c, vec3(0.11, 0.085, 0.055), max(dead, 0.4 * uLife.x * (1.0 - uLife.y)));
      rel = mix(rel, up * dot(rel, up), 0.25 * dead);
      rel *= 1.0 - burnt;
      vLeafLoss = dead * smoothstep(0.15, 1.4, yrs);
    }
    c = mix(c, vec3(0.025, 0.022, 0.02), burnt);
    float tFall = 5.0 + 25.0 * r3, tRot = tFall + 20.0 + 60.0 * r2;
    float snag = dead * (1.0 - flatten) * smoothstep(tFall, tFall * 1.15, yrs);
    rel *= 1.0 - dead * smoothstep(tRot, tRot * 1.3, yrs);
    // Blast victims fall away from the crater (bent trees later fall the way they lean); snags fall anywhere.
    float fall = flatten * (1.35 + 0.15 * aInst.x) + bend + snag * 1.45;
    if (fall > 0.0) {
      vec3 dir = flatten + bend > 0.0
        ? up - uImpactDir * dot(up, uImpactDir)
        : cross(up, vec3(r2 - 0.5, 0.3, r3 - 0.5));
      vec3 axis = normalize(cross(up, normalize(dir + 1e-6)));
      rel = rotateAxis(rel, axis, fall);
      nrm = rotateAxis(nrm, axis, fall);
      crown = rotateAxis(crown, axis, fall);
    }
  }
  vec3 winter = fxWinter(up);
  float snow = smoothstep(-1.0, -8.0, winter.y) * smoothstep(-2.0, -6.0, winter.z) * smoothstep(0.2, 0.8, dot(crown, up));
  vBase = mix(c, vec3(0.75, 0.78, 0.82), snow);
  vUv = uv;
  vN = nrm;
  vC = crown;
  vUp = up;
  vAO = aAO;
  vFoliage = part;

  // Light reaching the plant (per vertex: smooth over a plant), sky fill, and haze/dust as an affine map.
  vec3 L = uSunDir;
  vec3 pKm = (cellWorld + base) / 1000.0;
  vSunT = sunTransmittance(pKm + up * 0.05, L) * winter.x * SUN_E * uSunScale / PI;
  vSky = vec3(0.05, 0.075, 0.11) * smoothstep(-0.15, 0.25, dot(up, L)) * uSunScale * winter.x;

  vec4 mv = modelViewMatrix * vec4(base + rel, 1.0);
  float dist = length(mv.xyz);
  vView = normalize(transpose(mat3(viewMatrix)) * -mv.xyz);
  float haze = 1.0 - exp(-dist / 45000.0);
  float bd = fxBlastDust(fxAngle(up));
  vec3 f0 = fxBlastFog(uFogColor * winter.x * haze, dist, bd, up, up, 0.0, uBlastDustColor);
  vec3 f1 = fxBlastFog(mix(vec3(1.0), uFogColor * winter.x, haze), dist, bd, up, up, 0.0, uBlastDustColor);
  vFogB = f0;
  vFogA = f1 - f0;
  vFade = 1.0 - smoothstep(0.75, 1.0, dist / uFadeM);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uAtlas;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec3 vBase;
varying vec3 vN;
varying vec3 vC;
varying vec3 vUp;
varying float vAO;
varying float vFoliage;
varying float vLeafLoss;
varying vec3 vSunT;
varying vec3 vSky;
varying vec3 vFogA;
varying vec3 vFogB;
varying vec3 vView;
varying float vFade;

void main() {
  #include <logdepthbuf_fragment>
  // Dithered fade at the edge of the planted area, so cells don't pop.
  float d = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (d > vFade) discard;
  vec3 V = normalize(vView);
  vec3 n = normalize(vN);
  if (dot(n, V) < 0.0) n = -n;
  vec3 col, N;
  float alpha = 1.0, trans = 0.0;
  if (vFoliage > 0.5) {
    vec4 tx = texture2D(uAtlas, vUv);
    // Mip levels average the cut-out away: boost alpha with distance so crowns stay full, then
    // sharpen it into a crisp edge (anti-aliased by alpha-to-coverage).
    vec2 du = dFdx(vUv * 1024.0), dv = dFdy(vUv * 1024.0);
    float lod = 0.5 * log2(max(dot(du, du), dot(dv, dv)) + 1e-6);
    float a = tx.a * (1.0 + max(0.0, lod) * 0.28);
    float cut = 0.5 + 0.45 * vLeafLoss;
    alpha = clamp((a - cut) / max(fwidth(a), 1e-3) + 0.5, 0.0, 1.0);
    if (alpha < 0.3) discard;
    col = vBase * (0.5 + 0.95 * tx.r);
    N = normalize(mix(n, normalize(vC), 0.6));
    // Sunlight through the leaves when looking toward the Sun.
    trans = pow(max(0.0, dot(-V, uSunDir)), 3.0) * 0.55 * (1.0 - 0.4 * vAO);
  } else {
    // Bark: vertical fissures.
    float f = fract(sin(floor(vUv.x * 18.0) * 12.9898) * 43758.5453);
    col = vBase * (0.75 + 0.5 * f);
    N = n;
  }
  float ndl = max(0.0, (dot(N, uSunDir) + 0.3) / 1.3);
  vec3 radiance = col * (vSunT * (ndl * mix(0.45, 1.0, vAO) + trans) + vSky * (0.45 + 0.55 * max(0.0, dot(N, vUp))) * vAO);
  gl_FragColor = vec4(radiance * vFogA + vFogB, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function hash(a: number, b: number, c: number): () => number {
  let s = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** EIEP Table 1: deciduous trees ignite at 0.25 MJ/m² for a 1 Mt burst, scaling as E^(1/6). */
function treeIgnitionMJm2(energyMt: number): number {
  return 0.25 * energyMt ** (1 / 6);
}

interface Cell { key: string; group: Group; lastUsed: number; lod?: PlantLod; meshes: { mesh: InstancedMesh; hi: BufferGeometry; lo: BufferGeometry }[] }

export class Vegetation {
  readonly group = new Group();
  readonly material: ShaderMaterial;
  private readonly coverMaterial: ShaderMaterial;
  readonly map = new VegetationMap();
  private readonly geoms = new Map<string, BufferGeometry>();
  private readonly cells = new Map<string, Cell>();
  private readonly cover = new Map<string, Cell>();
  private frame = 0;
  private readonly ignition: number;
  private loading = false;
  instances = 0;

  constructor(
    private readonly heights: Heightfield,
    private readonly crater: CraterResult,
    sharedUniforms: Record<string, { value: unknown }>,
    private readonly opt: VegetationOptions,
  ) {
    this.group.name = 'vegetation';
    for (const k of KINDS) for (const lod of ['hi', 'lo'] as const) {
      const g = plantGeometry(k, lod);
      const pioneer = k === 'shrub' || k === 'treefern' || k === 'cycad' || k === 'fern' || k === 'horsetail' ? 1 : 0;
      g.setAttribute('pioneer', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(pioneer), 1));
      this.geoms.set(`${k}/${lod}`, g);
    }
    this.ignition = treeIgnitionMJm2(crater.energyMt);
    // Foliage cards are single planes: both sides drawn; cut-out edges smoothed by alpha-to-coverage.
    const uniforms = { ...sharedUniforms, uFogColor: { value: new Vector3(0.35, 0.45, 0.6) }, uAtlas: { value: makeFoliageAtlas() } };
    this.material = new ShaderMaterial({
      vertexShader, fragmentShader, uniforms: { ...uniforms, uFadeM: { value: 1800 } }, side: DoubleSide, alphaToCoverage: true,
    });
    // Ground cover shares everything but its (short) drawing distance.
    this.coverMaterial = new ShaderMaterial({
      vertexShader, fragmentShader, uniforms: { ...uniforms, uFadeM: { value: 120 } }, side: DoubleSide, alphaToCoverage: true,
    });
  }

  private buildCell(face: number, cx: number, cy: number): Cell {
    const n = 2 ** CELL_LEVEL;
    const rnd = hash(face + 1, cx, cy);
    const center = faceDirection(face, (cx + 0.5) / n, (cy + 0.5) / n, new Vector3());
    const centerPos = center.clone().multiplyScalar(EARTH_RADIUS + Math.max(0, this.heights.height(center, 30)));
    const cellSize = ((Math.PI / 2) * EARTH_RADIUS) / n;
    const per = Math.max(1, Math.round(cellSize / this.opt.spacing));
    const lists = new Map<PlantKind, { m: Matrix4; inst: number[] }[]>();
    const d = new Vector3(), q = new Quaternion(), yaw = new Quaternion(), m = new Matrix4(), pos = new Vector3(), scl = new Vector3();
    const site = IMPACT.site.value;
    const d2 = new Vector3();
    const place = (kind: PlantKind, dir: Vector3, sink: number) => {
      const h = this.heights.height(dir, 30);
      if (h < 1) return;
      pos.copy(dir).multiplyScalar(EARTH_RADIUS + h - sink).sub(centerPos);
      q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      yaw.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
      q.multiply(yaw);
      const sc = 0.65 + rnd() * 0.7;
      scl.set(sc, sc * (0.85 + 0.3 * rnd()), sc);
      m.compose(pos, q, scl);
      // Impact exposure at this plant (scaling laws, per instance so the blast front sweeps through).
      const rKm = centralAngle(site, vecToLatLon(dir)) * 6371;
      const fx = atDistance(this.crater, Math.max(1, rKm));
      const heat = fx.fireballVisible ? fx.thermalMJm2 / this.ignition : 0;
      let list = lists.get(kind);
      if (!list) lists.set(kind, (list = []));
      list.push({ m: m.clone(), inst: [rnd(), heat * (0.8 + 0.4 * rnd()), fx.blastArrivalS, fx.windMs * (0.85 + 0.3 * rnd())] });
    };
    for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
      const s = (cx + (i + rnd()) / per) / n, t = (cy + (j + rnd()) / per) / n;
      faceDirection(face, s, t, d);
      const veg = this.map.sample(d);
      const mix = plantMix(veg.cls, veg.tempC);
      if (!mix.length) continue;
      // Ground ferns: understorey wherever it is wet enough, thicker in clearings.
      const open = clearing(d);
      if (veg.cls !== 'arid_shrub' && rnd() < 0.25 + 0.35 * open) {
        faceDirection(face, (cx + (i + rnd()) / per) / n, (cy + (j + rnd()) / per) / n, d2);
        // Horsetails where it is wet (wetlands, and low ground near the coast), ferns elsewhere.
        const wet = veg.cls === 'wetland' || this.heights.height(d2, 30) < 25;
        place(wet && rnd() < 0.6 ? 'horsetail' : 'fern', d2, 0.1);
      }
      // Clumpy: thin by density, with clearings.
      if (rnd() > veg.density * (1 - 0.9 * open) * (0.75 + 0.5 * rnd())) continue;
      let r = rnd() * mix.reduce((a, [, w]) => a + w, 0);
      let kind = mix[0][0];
      for (const [k, w] of mix) { if ((r -= w) <= 0) { kind = k; break; } }
      place(kind, d, 0.6);
    }
    return this.makeCell(`${face}/${cx}/${cy}`, centerPos, lists, this.material);
  }

  /** Instanced meshes for a cell: one per kind, with a near and a far geometry sharing the instance data. */
  private makeCell(key: string, centerPos: Vector3, lists: Map<PlantKind, { m: Matrix4; inst: number[] }[]>, material: ShaderMaterial): Cell {
    const g = new Group();
    g.position.copy(centerPos);
    const meshes: Cell['meshes'] = [];
    for (const [kind, list] of lists) {
      const inst = new Float32Array(list.length * 4);
      const attr = new InstancedBufferAttribute(inst, 4);
      const [hi, lo] = (['hi', 'lo'] as const).map((lod) => {
        const geo = this.geoms.get(`${kind}/${lod}`)!.clone();
        geo.setAttribute('aInst', attr);
        return geo;
      });
      const mesh = new InstancedMesh(hi, material, list.length);
      list.forEach((e, i) => { mesh.setMatrixAt(i, e.m); inst.set(e.inst, i * 4); });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      g.add(mesh);
      meshes.push({ mesh, hi, lo });
      this.instances += list.length;
    }
    g.updateMatrixWorld(true);
    return { key, group: g, lastUsed: this.frame, lod: 'hi', meshes };
  }

  /** Small ferns and horsetails, densely, in ~38 m cells right around the camera. */
  private buildCoverCell(face: number, cx: number, cy: number): Cell {
    const n = 2 ** COVER_LEVEL;
    const rnd = hash(face + 101, cx, cy);
    const center = faceDirection(face, (cx + 0.5) / n, (cy + 0.5) / n, new Vector3());
    const centerPos = center.clone().multiplyScalar(EARTH_RADIUS + Math.max(0, this.heights.height(center, 30)));
    const lists = new Map<PlantKind, { m: Matrix4; inst: number[] }[]>();
    const veg = this.map.sample(center);
    const rKm = centralAngle(IMPACT.site.value, vecToLatLon(center)) * 6371;
    const fx = atDistance(this.crater, Math.max(1, rKm));
    const heat = fx.fireballVisible ? fx.thermalMJm2 / this.ignition : 0;
    const count = veg.cls === 'water' || veg.cls === 'desert' || veg.cls === 'rock' ? 0
      : Math.round(this.opt.coverPerCell * (veg.cls === 'arid_shrub' ? 0.15 : 0.35 + 0.65 * Math.min(1, veg.density + 0.3)));
    const wetCell = veg.cls === 'wetland';
    const d = new Vector3(), q = new Quaternion(), yaw = new Quaternion(), pos = new Vector3(), scl = new Vector3(), m = new Matrix4();
    for (let i = 0; i < count; i++) {
      faceDirection(face, (cx + rnd()) / n, (cy + rnd()) / n, d);
      const h = this.heights.height(d, 30);
      if (h < 1) continue;
      const kind = (wetCell || h < 25) && rnd() < 0.55 ? 'horsetail' : 'fern';
      pos.copy(d).multiplyScalar(EARTH_RADIUS + h - 0.05).sub(centerPos);
      q.setFromUnitVectors(new Vector3(0, 1, 0), d);
      yaw.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
      q.multiply(yaw);
      const sc = 0.45 + rnd() * 0.6;
      scl.set(sc, sc * (0.8 + 0.4 * rnd()), sc);
      m.compose(pos, q, scl);
      let list = lists.get(kind);
      if (!list) lists.set(kind, (list = []));
      list.push({ m: m.clone(), inst: [rnd(), heat * (0.8 + 0.4 * rnd()), fx.blastArrivalS, fx.windMs * (0.85 + 0.3 * rnd())] });
    }
    return this.makeCell(`${face}/${cx}/${cy}`, centerPos, lists, this.coverMaterial);
  }

  private dropCell(cell: Cell): void {
    this.group.remove(cell.group);
    for (const { mesh, hi, lo } of cell.meshes) { hi.dispose(); lo.dispose(); mesh.dispose(); this.instances -= mesh.count; }
  }

  update(camera: PerspectiveCamera, fogColor: Vector3): void {
    this.frame++;
    (this.material.uniforms.uFogColor.value as Vector3).copy(fogColor);
    const camDir = camera.position.clone().normalize();
    const alt = camera.position.length() - EARTH_RADIUS - Math.max(0, this.heights.height(camDir, 200));
    if (!this.map.ready && !this.loading && alt < this.opt.maxAltitude * 4) {
      this.loading = true;
      this.map.load(this.opt.baseUrl, this.opt.mapSize).catch((e) => console.warn('vegetation map unavailable', e));
    }
    const active = this.map.ready && this.heights.ready && alt < this.opt.maxAltitude;
    this.group.visible = active;
    if (!active) return;
    const { face, s, t } = directionToFace(camDir);
    const n = 2 ** CELL_LEVEL;
    const cx = Math.floor(s * n), cy = Math.floor(t * n);
    let builds = 0;
    const R = this.opt.radiusCells;
    const cellSize = ((Math.PI / 2) * EARTH_RADIUS) / n;
    for (const c of cellsAround(face, cx, cy, R, n)) {
      const key = `${c.face}/${c.x}/${c.y}`;
      let cell = this.cells.get(key);
      if (!cell) {
        if (builds >= this.opt.buildsPerFrame) continue;
        builds++;
        cell = this.buildCell(c.face, c.x, c.y);
        this.cells.set(key, cell);
        this.group.add(cell.group);
      }
      cell.lastUsed = this.frame;
      // Full detail in the cells around the camera, fewer and larger cards beyond.
      const lod: PlantLod = cell.group.position.distanceTo(camera.position) < cellSize * 1.6 ? 'hi' : 'lo';
      if (lod !== cell.lod) {
        cell.lod = lod;
        for (const m of cell.meshes) m.mesh.geometry = lod === 'hi' ? m.hi : m.lo;
      }
    }
    // Ground cover, only when close to the ground.
    if (alt < 300 && this.opt.coverCells > 0) {
      const { face: cf, s: cs, t: ct } = directionToFace(camDir);
      const nc = 2 ** COVER_LEVEL;
      let coverBuilds = 0;
      for (const c of cellsAround(cf, Math.floor(cs * nc), Math.floor(ct * nc), this.opt.coverCells, nc)) {
        const key = `${c.face}/${c.x}/${c.y}`;
        let cell = this.cover.get(key);
        if (!cell) {
          if (coverBuilds >= 4) continue;
          coverBuilds++;
          cell = this.buildCoverCell(c.face, c.x, c.y);
          this.cover.set(key, cell);
          this.group.add(cell.group);
        }
        cell.lastUsed = this.frame;
        const coverSize = ((Math.PI / 2) * EARTH_RADIUS) / nc;
        const lod: PlantLod = cell.group.position.distanceTo(camera.position) < coverSize * 1.6 ? 'hi' : 'lo';
        if (lod !== cell.lod) {
          cell.lod = lod;
          for (const m of cell.meshes) m.mesh.geometry = lod === 'hi' ? m.hi : m.lo;
        }
      }
    }
    // Drop cells that are out of range.
    for (const map of [this.cells, this.cover]) for (const [key, cell] of map) {
      if (cell.lastUsed === this.frame) continue;
      this.dropCell(cell);
      map.delete(key);
    }
  }
}
