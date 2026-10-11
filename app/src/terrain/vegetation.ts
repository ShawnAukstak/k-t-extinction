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
  BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, type PerspectiveCamera, Quaternion,
  ShaderMaterial, Vector3,
} from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { centralAngle, vecToLatLon } from '../core/geo';
import { atDistance, type CraterResult } from '../physics/eiep';
import { directionToFace, faceDirection, FACE_NAMES } from '../render/cube';
import { atmosphereChunk } from '../render/shaders/atmosphere';
import { effectsChunk } from '../render/shaders/effects';
import type { Heightfield } from './heightfield';
import { simplex3 } from './noise';
import { plantGeometry, plantMix, type PlantKind } from './plants';

const KINDS: PlantKind[] = ['conifer', 'broadleaf', 'palm', 'treefern', 'cycad', 'shrub'];
const CELL_LEVEL = 14; // ~611 m cells

export interface VegetationOptions {
  /** Cells either side of the camera's cell (desktop 2 → 5×5). */
  radiusCells: number;
  /** Mean spacing between plants at full density, m. */
  spacing: number;
  /** Only grow plants when the camera is lower than this, m. */
  maxAltitude: number;
  buildsPerFrame: number;
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
attribute float part;
attribute vec4 aInst;         // x variation, y heat exposure / ignition, z blast arrival (s), w blast wind (m/s)
uniform vec3 uCamPosKm;
uniform vec3 uFogColor;
varying vec3 vColor;
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

  // Air blast: knock down (or bend) away from the crater once the front has passed.
  float fall = 0.0;
  if (uT > aInst.z && aInst.w > 30.0) {
    float k = smoothstep(aInst.z, aInst.z + 4.0 + 3.0 * aInst.x, uT);
    fall = aInst.w > 62.0 ? k * (1.35 + 0.15 * aInst.x) : k * 0.35 * smoothstep(30.0, 62.0, aInst.w);
  }
  if (fall > 0.0) {
    vec3 away = normalize(up - uImpactDir * dot(up, uImpactDir) + 1e-6);
    vec3 axis = normalize(cross(up, away));
    rel = rotateAxis(rel, axis, fall);
    nrm = rotateAxis(nrm, axis, fall);
  }

  // Foliage colour: species variation, scorching, winter die-back, recovery.
  vec3 leaf = mix(vec3(0.045, 0.085, 0.035), vec3(0.075, 0.11, 0.04), aInst.x);
  vec3 bark = vec3(0.09, 0.07, 0.05);
  vec3 c = part > 0.5 ? leaf : bark;
  float burnt = uT > 12.0 ? smoothstep(0.9, 1.3, aInst.y) : 0.0;
  c = mix(c, vec3(0.025, 0.022, 0.02), burnt);
  float dead = part > 0.5 ? uLife.x * (1.0 - uLife.z) : 0.0;
  c = mix(c, vec3(0.11, 0.085, 0.055), dead * (1.0 - burnt));
  // Dead or burnt crowns thin out toward the trunk.
  if (part > 0.5) rel = mix(rel, up * dot(rel, up), 0.55 * max(burnt, dead));
  vec3 winter = fxWinter(up);
  float snow = smoothstep(-1.0, -8.0, winter.y) * smoothstep(-2.0, -6.0, winter.z) * smoothstep(0.2, 0.8, dot(nrm, up));
  c = mix(c, vec3(0.75, 0.78, 0.82), snow);

  // Lighting (per vertex: plants are small and many).
  vec3 L = uSunDir;
  vec3 pKm = (cellWorld + base) / 1000.0;
  vec3 sunT = sunTransmittance(pKm + up * 0.05, L) * winter.x;
  float ndl = max(0.0, dot(nrm, L)) * 0.8 + 0.2 * max(0.0, dot(up, L));
  vec3 skyFill = vec3(0.05, 0.075, 0.11) * smoothstep(-0.15, 0.25, dot(up, L)) * uSunScale * winter.x;
  vec3 radiance = c * (sunT * SUN_E * uSunScale * ndl / PI + skyFill);

  vec4 mv = modelViewMatrix * vec4(base + rel, 1.0);
  float dist = length(mv.xyz);
  // Simple aerial perspective for the short distances plants are drawn at.
  float haze = 1.0 - exp(-dist / 45000.0);
  vColor = mix(radiance, uFogColor * winter.x, haze);
  vFade = 1.0 - smoothstep(0.75, 1.0, dist / 1800.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  // Dithered fade at the edge of the planted area, so cells don't pop.
  float d = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (d > vFade) discard;
  gl_FragColor = vec4(vColor, 1.0);
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

interface Cell { key: string; group: Group; lastUsed: number }

export class Vegetation {
  readonly group = new Group();
  readonly material: ShaderMaterial;
  readonly map = new VegetationMap();
  private readonly geoms = new Map<PlantKind, BufferGeometry>();
  private readonly cells = new Map<string, Cell>();
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
    for (const k of KINDS) this.geoms.set(k, plantGeometry(k));
    this.ignition = treeIgnitionMJm2(crater.energyMt);
    this.material = new ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: { ...sharedUniforms, uFogColor: { value: new Vector3(0.35, 0.45, 0.6) } },
    });
  }

  private buildCell(face: number, cx: number, cy: number): Group {
    const n = 2 ** CELL_LEVEL;
    const rnd = hash(face + 1, cx, cy);
    const center = faceDirection(face, (cx + 0.5) / n, (cy + 0.5) / n, new Vector3());
    const centerPos = center.clone().multiplyScalar(EARTH_RADIUS + Math.max(0, this.heights.height(center, 30)));
    const cellSize = ((Math.PI / 2) * EARTH_RADIUS) / n;
    const per = Math.max(1, Math.round(cellSize / this.opt.spacing));
    const lists = new Map<PlantKind, { m: Matrix4; inst: number[] }[]>();
    const d = new Vector3(), q = new Quaternion(), yaw = new Quaternion(), m = new Matrix4(), pos = new Vector3(), scl = new Vector3();
    const site = IMPACT.site.value;
    for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
      const s = (cx + (i + rnd()) / per) / n, t = (cy + (j + rnd()) / per) / n;
      faceDirection(face, s, t, d);
      const veg = this.map.sample(d);
      // Clumpy: thin by density, with clearings.
      const open = clearing(d);
      if (rnd() > veg.density * (1 - 0.9 * open) * (0.75 + 0.5 * rnd())) continue;
      const mix = plantMix(veg.cls, veg.tempC);
      if (!mix.length) continue;
      let r = rnd() * mix.reduce((a, [, w]) => a + w, 0);
      let kind = mix[0][0];
      for (const [k, w] of mix) { if ((r -= w) <= 0) { kind = k; break; } }
      const h = this.heights.height(d, 30);
      if (h < 1) continue;
      pos.copy(d).multiplyScalar(EARTH_RADIUS + h - 0.6).sub(centerPos);
      q.setFromUnitVectors(new Vector3(0, 1, 0), d);
      yaw.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
      q.multiply(yaw);
      const sc = 0.65 + rnd() * 0.7;
      scl.set(sc, sc * (0.85 + 0.3 * rnd()), sc);
      m.compose(pos, q, scl);
      // Impact exposure at this plant (scaling laws, per instance so the blast front sweeps through).
      const rKm = centralAngle(site, vecToLatLon(d)) * 6371;
      const fx = atDistance(this.crater, Math.max(1, rKm));
      const heat = fx.fireballVisible ? fx.thermalMJm2 / this.ignition : 0;
      let list = lists.get(kind);
      if (!list) lists.set(kind, (list = []));
      list.push({ m: m.clone(), inst: [rnd(), heat * (0.8 + 0.4 * rnd()), fx.blastArrivalS, fx.windMs * (0.85 + 0.3 * rnd())] });
    }
    const g = new Group();
    g.position.copy(centerPos);
    for (const [kind, list] of lists) {
      const mesh = new InstancedMesh(this.geoms.get(kind)!, this.material, list.length);
      const inst = new Float32Array(list.length * 4);
      list.forEach((e, i) => { mesh.setMatrixAt(i, e.m); inst.set(e.inst, i * 4); });
      mesh.geometry = this.geoms.get(kind)!.clone();
      mesh.geometry.setAttribute('aInst', new InstancedBufferAttribute(inst, 4));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      g.add(mesh);
      this.instances += list.length;
    }
    g.updateMatrixWorld(true);
    return g;
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
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue; // (cells across cube-face edges are skipped)
      const key = `${face}/${x}/${y}`;
      let cell = this.cells.get(key);
      if (!cell) {
        if (builds >= this.opt.buildsPerFrame) continue;
        builds++;
        cell = { key, group: this.buildCell(face, x, y), lastUsed: this.frame };
        this.cells.set(key, cell);
        this.group.add(cell.group);
      }
      cell.lastUsed = this.frame;
    }
    // Drop cells that are out of range.
    for (const [key, cell] of this.cells) {
      if (cell.lastUsed === this.frame) continue;
      this.group.remove(cell.group);
      for (const ch of cell.group.children) (ch as InstancedMesh).geometry.dispose();
      for (const ch of cell.group.children) this.instances -= (ch as InstancedMesh).count;
      this.cells.delete(key);
    }
  }
}
