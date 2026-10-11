/**
 * Animals on the ground: herds placed in ~5 km cells around the camera at densities from body mass
 * (fauna.ts), wandering deterministically with sim time (shared links show the same animals in the
 * same places), animated in the vertex shader (gait, grazing, tail sway).
 *
 * Fate, from the same physics as everything else:
 *   - fireball heat above the burn threshold (EIEP third-degree burns, scaled) kills near the crater;
 *   - the air blast knocks animals over where winds exceed ~50 m/s, when the front arrives;
 *   - everywhere else, non-avian dinosaurs die during the impact winter (each individual at a random
 *     time between ~2 weeks and ~18 months — the exact timeline is unknown; labelled "model").
 * Carcasses remain for about a month.
 */
import {
  type BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, type PerspectiveCamera, Quaternion,
  ShaderMaterial, Vector3,
} from 'three';
import { EARTH_RADIUS, IMPACT } from '../config';
import { bearing, centralAngle, DEG, enuBasis, vecToLatLon, type LatLon } from '../core/geo';
import { atDistance, type CraterResult } from '../physics/eiep';
import { directionToFace, faceDirection } from '../render/cube';
import { atmosphereChunk } from '../render/shaders/atmosphere';
import { effectsChunk } from '../render/shaders/effects';
import type { Heightfield } from '../terrain/heightfield';
import { clearing, type VegetationMap } from '../terrain/vegetation';
import { bodyGeometry } from './bodies';
import { densityPerKm2, type RegionDef, type SpeciesDef } from './fauna';

const CELL_LEVEL = 11; // ~4.9 km cells
const DAY = 86_400;

export interface HerdOptions {
  radiusCells: number;
  maxAltitude: number;
  buildsPerFrame: number;
  /** Cap on animals per cell (performance). */
  maxPerCell: number;
}

interface Animal {
  offE: number; offN: number;   // offset from the herd centre, m (east/north)
  phase: number;
  scale: number;
  look: [number, number, number, number];
  dieAt: number;                // sim seconds; Infinity = survives
  fallAway: boolean;            // knocked down by the blast (vs died in place)
}

interface Herd {
  species: SpeciesDef;
  base: Vector3;                // unit direction of the herd's home point
  e: Vector3; n: Vector3; u: Vector3;
  wander: [number, number, number, number, number]; // amplitude m, ω1, φ1, ω2, φ2
  animals: Animal[];
  blastAt: number;
  wind: number;
  /** Bearing from the crater to the herd, radians (blast victims fall this way). */
  away: number;
}

interface Cell {
  key: string;
  group: Group;
  centerPos: Vector3;
  herds: Herd[];
  meshes: Map<string, { mesh: InstancedMesh; anim: InstancedBufferAttribute; look: InstancedBufferAttribute; items: { herd: Herd; a: Animal }[] }>;
  lastUsed: number;
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
${atmosphereChunk}
${effectsChunk}
attribute float part;
attribute vec3 pivot;
attribute float tint;
attribute vec4 aAnim;   // x gait phase (cycles), y walk amount 0–1, z graze 0–1, w fallen 0–1
attribute vec4 aLook;   // xyz base colour, w burnt
uniform vec3 uFogColor;
varying vec3 vColor;
varying float vFade;

vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }

void main() {
  vec3 p = position;
  vec3 nrm = normal;
  float ph = aAnim.x * 6.2831853;
  float walk = aAnim.y * (1.0 - aAnim.w);
  // Legs: diagonal pairs swing together.
  if (part > 2.5 && part < 6.5) {
    float off = (part == 3.0 || part == 6.0) ? 0.0 : 3.14159;
    float a = sin(ph + off) * 0.5 * walk;
    p = pivot + rotX(p - pivot, a);
    nrm = rotX(nrm, a);
  } else if (part == 1.0) {
    // Head: down to graze, a little bob when walking.
    float a = 0.85 * aAnim.z * (1.0 - walk) + 0.06 * sin(ph * 2.0) * walk;
    p = pivot + rotX(p - pivot, a);
    nrm = rotX(nrm, a);
  } else if (part == 2.0) {
    float a = 0.15 * sin(ph + 1.3) * (0.3 + walk);
    p = pivot + rotY(p - pivot, a);
    nrm = rotY(nrm, a);
  }
  p.y += 0.03 * sin(ph * 2.0) * walk * pivot.y;
  // Fallen: roll onto the side.
  if (aAnim.w > 0.0) {
    float a = 1.45 * aAnim.w;
    p = rotZ(p, a) + vec3(0.0, -0.25 * aAnim.w * pivot.y, 0.0);
    nrm = rotZ(nrm, a);
  }
  vec4 rel4 = instanceMatrix * vec4(p, 1.0);
  vec3 base = instanceMatrix[3].xyz;
  vec3 cellWorld = modelMatrix[3].xyz;
  vec3 up = normalize(cellWorld + base);
  vec3 wn = normalize(mat3(instanceMatrix) * nrm);

  // Colour: chosen (skin colours are unknown) — countershaded, lighter belly; frills/horns/clubs paler.
  vec3 c = aLook.xyz * mix(0.75, 1.25, smoothstep(0.6, -0.4, dot(wn, up)));
  c = mix(c, vec3(0.42, 0.38, 0.30), tint * 0.6);
  c = mix(c, vec3(0.03, 0.025, 0.02), aLook.w);
  vec3 winter = fxWinter(up);
  vec3 L = uSunDir;
  vec3 pKm = (cellWorld + base) / 1000.0;
  vec3 sunT = sunTransmittance(pKm + up * 0.05, L) * winter.x;
  float ndl = max(0.0, dot(wn, L));
  vec3 skyFill = vec3(0.05, 0.075, 0.11) * smoothstep(-0.15, 0.25, dot(up, L)) * uSunScale * winter.x;
  vec3 radiance = c * (sunT * SUN_E * uSunScale * ndl / PI + skyFill * (0.6 + 0.4 * dot(wn, up)));

  vec4 mv = modelViewMatrix * vec4(rel4.xyz, 1.0);
  float dist = length(mv.xyz);
  vColor = mix(radiance, uFogColor * winter.x, 1.0 - exp(-dist / 45000.0));
  vFade = 1.0 - smoothstep(0.8, 1.0, dist / 9000.0);
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
  float d = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (d > vFade) discard;
  gl_FragColor = vec4(vColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function rng(a: number, b: number, c: number): () => number {
  let s = (a * 2654435761) ^ (b * 2246822519) ^ (c * 3266489917);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, r: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (r() + r() + r() - 1.5) * 2));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

/** Muted, plausible body colours (chosen; real colours are unknown for these animals). */
const PALETTES: [number, number, number][] = [
  [0.16, 0.14, 0.10], [0.20, 0.17, 0.12], [0.13, 0.13, 0.10], [0.22, 0.16, 0.10], [0.15, 0.15, 0.13], [0.18, 0.12, 0.08],
];

export class Herds {
  readonly group = new Group();
  readonly material: ShaderMaterial;
  private readonly geoms = new Map<string, BufferGeometry>();
  private readonly cells = new Map<string, Cell>();
  private readonly speciesById = new Map<string, SpeciesDef>();
  private frame = 0;
  private readonly burnLethal: number;
  animals = 0;
  regions: RegionDef[];

  constructor(
    private readonly heights: Heightfield,
    private readonly veg: VegetationMap,
    private readonly crater: CraterResult,
    sharedUniforms: Record<string, { value: unknown }>,
    private readonly opt: HerdOptions,
    species: SpeciesDef[],
    regions: RegionDef[],
  ) {
    this.group.name = 'herds';
    for (const s of species) this.speciesById.set(s.id, s);
    this.regions = regions;
    // EIEP Table 1: third-degree burns at 0.42 MJ/m² for 1 Mt, scaling as E^(1/6).
    this.burnLethal = 0.42 * crater.energyMt ** (1 / 6);
    this.material = new ShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: { ...sharedUniforms, uFogColor: { value: new Vector3(0.35, 0.45, 0.6) } },
    });
  }

  setRoster(species: SpeciesDef[], regions: RegionDef[]): void {
    this.speciesById.clear();
    for (const s of species) this.speciesById.set(s.id, s);
    this.regions = regions;
    for (const c of this.cells.values()) this.dropCell(c);
    this.cells.clear();
  }

  private geometry(s: SpeciesDef): BufferGeometry {
    let g = this.geoms.get(s.id);
    if (!g) {
      g = bodyGeometry({ group: s.group, lengthM: s.lengthM, hipHeightM: s.hipHeightM });
      this.geoms.set(s.id, g);
    }
    return g;
  }

  private regionAt(ll: LatLon): RegionDef | null {
    let best: RegionDef | null = null, bestW = 0;
    for (const r of this.regions) {
      const d = centralAngle(ll, r.center) * 6371;
      const w = 1 - d / r.radiusKm;
      if (w > bestW) { bestW = w; best = r; }
    }
    return best;
  }

  private buildCell(face: number, cx: number, cy: number): Cell {
    const n = 2 ** CELL_LEVEL;
    const r = rng(face + 7, cx, cy);
    const center = faceDirection(face, (cx + 0.5) / n, (cy + 0.5) / n, new Vector3());
    const centerPos = center.clone().multiplyScalar(EARTH_RADIUS + Math.max(0, this.heights.height(center, 60)));
    const cellKm = ((Math.PI / 2) * 6371) / n;
    const area = cellKm * cellKm;
    const herds: Herd[] = [];
    const region = this.regionAt(vecToLatLon(center));
    const site = IMPACT.site.value;
    if (region) {
      const maxAb = Math.max(...region.fauna.map((f) => f.abundance), 1e-6);
      let total = 0;
      for (const f of region.fauna) {
        const sp = this.speciesById.get(f.species);
        if (!sp || sp.group === 'mosasaur' || sp.group === 'plesiosaur') continue; // sea creatures: not on land
        const veg = this.veg.sample(center);
        const habitat = 0.3 + 0.7 * veg.density;
        const expected = densityPerKm2(sp.massKg, sp.diet) * Math.sqrt(f.abundance / maxAb) * habitat * area;
        const g = f.group ?? sp.groupSize;
        const meanGroup = (g[0] + g[1]) / 2;
        const herdsN = poisson(expected / Math.max(1, meanGroup), r);
        for (let h = 0; h < herdsN && total < this.opt.maxPerCell; h++) {
          // Home point: random in the cell, on land, preferring open ground (grazers favour clearings).
          let dir: Vector3 | null = null, bestOpen = -1;
          for (let tries = 0; tries < 10; tries++) {
            const d = faceDirection(face, (cx + r()) / n, (cy + r()) / n, new Vector3());
            if (this.heights.height(d, 200) <= 2) continue;
            const o = clearing(d);
            if (o > bestOpen) { bestOpen = o; dir = d; }
            if (o > 0.7) break;
          }
          if (!dir) continue;
          const size = Math.max(1, Math.round(g[0] + r() * (g[1] - g[0])));
          const ll = vecToLatLon(dir);
          const { e, n: nn, u } = enuBasis(ll.lat, ll.lon);
          const rKm = centralAngle(site, ll) * 6371;
          const fx = atDistance(this.crater, Math.max(1, rKm));
          const spread = Math.sqrt(size) * sp.lengthM * 1.6;
          const animals: Animal[] = [];
          for (let i = 0; i < size && total < this.opt.maxPerCell; i++, total++) {
            const pal = PALETTES[Math.floor(r() * PALETTES.length)];
            const v = 0.85 + 0.3 * r();
            const burnt = fx.fireballVisible && fx.thermalMJm2 > this.burnLethal;
            // Fate: heat (near), blast (regional), or the impact winter (everywhere else).
            let dieAt = Infinity, fallAway = false;
            if (burnt) dieAt = 10 + r() * 20;
            else if (fx.windMs > 50) { dieAt = fx.blastArrivalS + r() * 3; fallAway = true; }
            else if (!sp.survives) dieAt = 14 * DAY + r() ** 1.5 * 540 * DAY;
            animals.push({
              offE: (r() - 0.5) * spread, offN: (r() - 0.5) * spread, phase: r(), scale: 0.85 + 0.3 * r(),
              look: [pal[0] * v, pal[1] * v, pal[2] * v, burnt ? 1 : 0], dieAt, fallAway,
            });
          }
          herds.push({
            species: sp, base: dir, e, n: nn, u,
            wander: [40 + r() * sp.lengthM * 25, 0.002 + r() * 0.004, r() * 6.28, 0.002 + r() * 0.004, r() * 6.28],
            animals, blastAt: fx.blastArrivalS, wind: fx.windMs, away: bearing(site, ll) * DEG,
          });
        }
      }
    }
    // One InstancedMesh per species in this cell.
    const group = new Group();
    group.position.copy(centerPos);
    const meshes: Cell['meshes'] = new Map();
    const bySpecies = new Map<string, { herd: Herd; a: Animal }[]>();
    for (const h of herds) for (const a of h.animals) {
      let l = bySpecies.get(h.species.id);
      if (!l) bySpecies.set(h.species.id, (l = []));
      l.push({ herd: h, a });
    }
    for (const [id, items] of bySpecies) {
      const sp = this.speciesById.get(id)!;
      const geo = this.geometry(sp).clone();
      const anim = new InstancedBufferAttribute(new Float32Array(items.length * 4), 4);
      const look = new InstancedBufferAttribute(new Float32Array(items.length * 4), 4);
      items.forEach((it, i) => look.setXYZW(i, ...it.a.look));
      geo.setAttribute('aAnim', anim);
      geo.setAttribute('aLook', look);
      const mesh = new InstancedMesh(geo, this.material, items.length);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.name = `herd-${id}`;
      group.add(mesh);
      meshes.set(id, { mesh, anim, look, items });
      this.animals += items.length;
    }
    group.updateMatrixWorld(true);
    return { key: `${face}/${cx}/${cy}`, group, centerPos, herds, meshes, lastUsed: this.frame };
  }

  private dropCell(c: Cell): void {
    this.group.remove(c.group);
    for (const m of c.meshes.values()) { m.mesh.geometry.dispose(); this.animals -= m.items.length; }
  }

  private readonly _m = new Matrix4();
  private readonly _q = new Quaternion();
  private readonly _yaw = new Quaternion();
  private readonly _p = new Vector3();
  private readonly _d = new Vector3();
  private readonly _s = new Vector3();
  private readonly _up = new Vector3(0, 1, 0);
  private readonly _basis = new Matrix4();
  private readonly _west = new Vector3();

  update(camera: PerspectiveCamera, t: number, rate: number, fogColor: Vector3): void {
    this.frame++;
    (this.material.uniforms.uFogColor.value as Vector3).copy(fogColor);
    const camDir = camera.position.clone().normalize();
    const alt = camera.position.length() - EARTH_RADIUS - Math.max(0, this.heights.height(camDir, 200));
    const active = this.heights.ready && this.veg.ready && alt < this.opt.maxAltitude;
    this.group.visible = active;
    if (!active) return;
    const { face, s, t: tt } = directionToFace(camDir);
    const n = 2 ** CELL_LEVEL;
    const cx = Math.floor(s * n), cy = Math.floor(tt * n);
    let builds = 0;
    const R = this.opt.radiusCells;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const key = `${face}/${x}/${y}`;
      let cell = this.cells.get(key);
      if (!cell) {
        if (builds >= this.opt.buildsPerFrame) continue;
        builds++;
        cell = this.buildCell(face, x, y);
        this.cells.set(key, cell);
        this.group.add(cell.group);
      }
      cell.lastUsed = this.frame;
      this.animateCell(cell, t, rate);
    }
    for (const [key, cell] of this.cells) {
      if (cell.lastUsed === this.frame) continue;
      this.dropCell(cell);
      this.cells.delete(key);
    }
  }

  private animateCell(cell: Cell, t: number, rate: number): void {
    // At time-lapse speeds, motion would only be jitter: hold animals still.
    const live = Math.abs(rate) < 40;
    const ta = live ? t : 0;
    for (const { mesh, anim, items } of cell.meshes.values()) {
      items.forEach(({ herd, a }, i) => {
        const sp = herd.species;
        const [A, w1, p1, w2, p2] = herd.wander;
        const dead = t >= a.dieAt;
        const carcassGone = t > a.dieAt + 30 * DAY;
        const tm = dead ? Math.min(ta, a.dieAt) : ta;
        const ce = A * Math.sin(w1 * tm + p1), cn = A * Math.sin(w2 * tm + p2);
        const ve = A * w1 * Math.cos(w1 * tm + p1), vn = A * w2 * Math.cos(w2 * tm + p2);
        const speed = Math.hypot(ve, vn);
        const heading = Math.atan2(ve, vn); // from north, toward east
        // Graze/walk cycle (minutes long), offset per animal.
        const cycle = 0.5 + 0.5 * Math.sin(tm * 0.01 + a.phase * 6.28);
        const walking = sp.diet === 'carnivore' ? 0.8 : cycle > 0.55 ? 1 : 0.15;
        const e = ce + a.offE + 3 * Math.sin(tm * 0.05 + a.phase * 9), nn = cn + a.offN + 3 * Math.cos(tm * 0.04 + a.phase * 7);
        this._d.copy(herd.base).multiplyScalar(EARTH_RADIUS).addScaledVector(herd.e, e).addScaledVector(herd.n, nn).normalize();
        const h = Math.max(0, this.heights.height(this._d, 30));
        this._p.copy(this._d).multiplyScalar(EARTH_RADIUS + h).sub(cell.centerPos);
        // Orientation: right-handed local frame x = west, y = up, z = north (forward), then turn to the
        // heading. A yaw ψ points forward at bearing −ψ; the roll (toward local −x) falls at bearing π/2 − ψ,
        // so blast victims use ψ = π/2 − (bearing away from the crater).
        this._west.copy(herd.e).negate();
        this._basis.makeBasis(this._west, this._d, herd.n);
        this._q.setFromRotationMatrix(this._basis);
        const yaw = dead && a.fallAway ? Math.PI / 2 - herd.away : -heading;
        this._yaw.setFromAxisAngle(this._up, yaw);
        this._q.multiply(this._yaw);
        const sc = carcassGone ? 0.0001 : a.scale;
        this._s.set(sc, sc, sc);
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(i, this._m);
        const stride = sp.lengthM * 0.9;
        const fallen = dead ? Math.min(1, (t - a.dieAt) / 2.5) : 0;
        anim.setXYZW(i, live ? (tm * Math.max(speed, sp.walkSpeed * walking)) / stride + a.phase : a.phase,
          live ? walking : 0, 1 - walking, fallen);
      });
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
    }
  }

  /** How many of the animals around the camera are alive at sim time t (tests, HUD). */
  aliveAt(t: number): number {
    let n = 0;
    for (const c of this.cells.values()) for (const h of c.herds) for (const a of h.animals) if (t < a.dieAt) n++;
    return n;
  }
}
