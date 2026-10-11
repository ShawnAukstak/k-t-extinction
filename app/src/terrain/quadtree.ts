/**
 * Cube-sphere quadtree terrain. Each cube face subdivides into tiles by screen-space error; each tile
 * is a small grid mesh with heights from the Heightfield, vertices stored relative to the tile centre
 * (three.js composes model-view in float64), per-vertex geometric normals, and skirts that hide cracks
 * between neighbouring levels.
 *
 * A parent keeps drawing until all four children are built, so there are never holes; builds are
 * budgeted per frame; least-recently-used tiles are evicted beyond a cap.
 */
import {
  BufferAttribute, BufferGeometry, Frustum, Group, Matrix4, Mesh, type PerspectiveCamera, type ShaderMaterial, Sphere, Vector3,
} from 'three';
import { EARTH_RADIUS } from '../config';
import { faceDirection } from '../render/cube';
import { DETAIL_PERIOD_M } from './detail';
import type { Heightfield } from './heightfield';

interface Tile {
  key: string;
  face: number;
  level: number;
  x: number;
  y: number;
  mesh: Mesh | null;
  center: Vector3;        // unit direction of the tile centre
  angularRadius: number;  // radians, centre to corner
  maxHeight: number;
  lastUsed: number;
}

export interface QuadtreeOptions {
  segments: number;
  maxLevel: number;
  /** Target size of a grid cell on screen, px. */
  pixelError: number;
  maxTiles: number;
  buildsPerFrame: number;
}

const _d = new Vector3();
const _p = new Vector3();

export class Quadtree {
  readonly group = new Group();
  private readonly tiles = new Map<string, Tile>();
  private readonly frustum = new Frustum();
  private readonly projView = new Matrix4();
  private readonly sphere = new Sphere();
  private frame = 0;
  private builds = 0;
  private readonly indexCache = new Map<string, BufferAttribute>();
  /** Whether (s, t) grid order winds outward on each face (front faces must point out of the planet). */
  private readonly outward = [0, 1, 2, 3, 4, 5].map((f) => {
    const a = faceDirection(f, 0.5, 0.5), b = faceDirection(f, 0.51, 0.5), c = faceDirection(f, 0.5, 0.51);
    return b.clone().sub(a).cross(c.clone().sub(a)).dot(a) > 0;
  });
  /** Visible leaf tiles drawn last frame (for stats and tests). */
  drawn = 0;
  maxLevelDrawn = 0;

  constructor(
    private readonly material: ShaderMaterial,
    private readonly heights: Heightfield,
    private readonly opt: QuadtreeOptions,
  ) {
    this.group.name = 'terrain';
  }

  /** Drop all meshes (e.g. when better height data arrives). */
  invalidate(): void {
    for (const t of this.tiles.values()) this.disposeMesh(t);
    this.tiles.clear();
  }

  private tile(face: number, level: number, x: number, y: number): Tile {
    const key = `${face}/${level}/${x}/${y}`;
    let t = this.tiles.get(key);
    if (!t) {
      const size = 1 / 2 ** level;
      const c = faceDirection(face, (x + 0.5) * size, (y + 0.5) * size, new Vector3());
      // Gnomonic cube faces are distorted: the four corners are at different angles from the centre.
      let minDot = 1;
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        minDot = Math.min(minDot, c.dot(faceDirection(face, (x + i) * size, (y + j) * size, _p)));
      }
      t = { key, face, level, x, y, mesh: null, center: c, angularRadius: Math.acos(Math.min(1, minDot)) * 1.02, maxHeight: 6000, lastUsed: 0 };
      this.tiles.set(key, t);
    }
    t.lastUsed = this.frame;
    return t;
  }

  update(camera: PerspectiveCamera, viewportHeight: number): void {
    this.frame++;
    this.builds = 0;
    this.drawn = 0;
    this.maxLevelDrawn = 0;
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    for (const child of this.group.children) child.visible = false;
    const k = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let f = 0; f < 6; f++) this.visit(this.tile(f, 0, 0, 0), camera.position, k);
    this.evict();
  }

  private visible(t: Tile, cam: Vector3): boolean {
    // Horizon: hidden if the whole tile is beyond the planet's limb as seen from the camera.
    const rc = cam.length();
    const horizon = Math.acos(Math.min(1, EARTH_RADIUS / rc));
    const mountains = Math.acos(Math.min(1, EARTH_RADIUS / (EARTH_RADIUS + t.maxHeight + 1)));
    const ang = Math.acos(Math.max(-1, Math.min(1, t.center.dot(_d.copy(cam).divideScalar(rc)))));
    if (ang - t.angularRadius > horizon + mountains + 0.01) return false;
    this.sphere.center.copy(t.center).multiplyScalar(EARTH_RADIUS);
    this.sphere.radius = EARTH_RADIUS * t.angularRadius * 1.1 + t.maxHeight;
    return this.frustum.intersectsSphere(this.sphere);
  }

  private visit(t: Tile, cam: Vector3, k: number): void {
    if (!this.visible(t, cam)) return;
    const tileSize = (Math.PI / 2) * EARTH_RADIUS / 2 ** t.level;
    const spacing = tileSize / this.opt.segments;
    _p.copy(t.center).multiplyScalar(EARTH_RADIUS);
    const dist = Math.max(1, _p.distanceTo(cam) - EARTH_RADIUS * t.angularRadius);
    const wantSplit = t.level < this.opt.maxLevel && (spacing * k) / dist > this.opt.pixelError;
    if (wantSplit) {
      const kids = [0, 1, 2, 3].map((i) => this.tile(t.face, t.level + 1, 2 * t.x + (i & 1), 2 * t.y + (i >> 1)));
      const ready = kids.every((c) => c.mesh || !this.visible(c, cam));
      if (ready) {
        for (const c of kids) this.visit(c, cam, k);
        return;
      }
      for (const c of kids) if (!c.mesh && this.visible(c, cam)) this.ensureMesh(c);
    }
    if (this.ensureMesh(t)) {
      t.mesh!.visible = true;
      this.drawn++;
      this.maxLevelDrawn = Math.max(this.maxLevelDrawn, t.level);
    }
  }

  private ensureMesh(t: Tile): boolean {
    if (t.mesh) return true;
    // Always build root tiles; otherwise respect the per-frame budget.
    if (t.level > 0 && this.builds >= this.opt.buildsPerFrame) return false;
    this.builds++;
    t.mesh = this.buildMesh(t);
    this.group.add(t.mesh);
    return true;
  }

  private indices(n: number, outward: boolean): BufferAttribute {
    const key = `${n}/${outward}`;
    let idx = this.indexCache.get(key);
    if (idx) return idx;
    const row = n + 1;
    const grid = row * row;
    const list: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (outward) list.push(a, b, c, b, d, c);
      else list.push(a, c, b, b, c, d);
    }
    // Skirts: border ring duplicated below the surface, in perimeter order.
    const border: number[] = [];
    for (let i = 0; i < n; i++) border.push(i);                       // bottom edge →
    for (let j = 0; j < n; j++) border.push(j * row + n);             // right edge ↑
    for (let i = n; i > 0; i--) border.push(n * row + i);             // top edge ←
    for (let j = n; j > 0; j--) border.push(j * row);                 // left edge ↓
    for (let e = 0; e < border.length; e++) {
      const a = border[e], b = border[(e + 1) % border.length];
      const sa = grid + e, sb = grid + ((e + 1) % border.length);
      list.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa); // both windings so either side is closed
    }
    idx = new BufferAttribute(new Uint32Array(list), 1);
    this.indexCache.set(key, idx);
    return idx;
  }

  private buildMesh(t: Tile): Mesh {
    const n = this.opt.segments;
    const row = n + 1;
    const size = 1 / 2 ** t.level;
    const s0 = t.x * size, t0 = t.y * size;
    const tileSize = (Math.PI / 2) * EARTH_RADIUS * size;
    const spacing = tileSize / n;
    const minWl = Math.max(30, spacing * 1.5);
    // Samples with a one-vertex apron for normals.
    const m = n + 3;
    const P = new Float64Array(m * m * 3);
    const dirs = new Float32Array(row * row * 3 + 4 * n * 3);
    const hgt = new Float32Array(row * row + 4 * n);
    // Detail coordinates: face-planar metres, offset per tile by whole periods so they stay small
    // (float32-safe) yet continuous across tiles (shifts are multiples of the texture period).
    const F = (Math.PI / 2) * EARTH_RADIUS;
    const u0 = ((s0 * F) % DETAIL_PERIOD_M), v0 = ((t0 * F) % DETAIL_PERIOD_M);
    const det = new Float32Array((row * row + 4 * n) * 2);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = (j * row + i) * 2;
      det[k] = u0 + (i / n) * size * F;
      det[k + 1] = v0 + (j / n) * size * F;
    }
    let maxH = 0;
    for (let j = -1; j <= n + 1; j++) for (let i = -1; i <= n + 1; i++) {
      faceDirection(t.face, s0 + (i / n) * size, t0 + (j / n) * size, _d);
      const h = this.heights.height(_d, minWl);
      const hs = Math.max(0, h);
      maxH = Math.max(maxH, hs);
      const k = ((j + 1) * m + (i + 1)) * 3;
      P[k] = _d.x * (EARTH_RADIUS + hs); P[k + 1] = _d.y * (EARTH_RADIUS + hs); P[k + 2] = _d.z * (EARTH_RADIUS + hs);
      if (i >= 0 && i <= n && j >= 0 && j <= n) {
        const v = (j * row + i) * 3;
        dirs[v] = _d.x; dirs[v + 1] = _d.y; dirs[v + 2] = _d.z;
        hgt[j * row + i] = h;
      }
    }
    t.maxHeight = maxH;
    const ci = ((Math.floor(n / 2) + 1) * m + Math.floor(n / 2) + 1) * 3;
    const cx = P[ci], cy = P[ci + 1], cz = P[ci + 2];
    const vertCount = row * row + 4 * n;
    const pos = new Float32Array(vertCount * 3);
    const nor = new Float32Array(vertCount * 3);
    const at = (i: number, j: number) => ((j + 1) * m + (i + 1)) * 3;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const v = (j * row + i) * 3, k = at(i, j);
      pos[v] = P[k] - cx; pos[v + 1] = P[k + 1] - cy; pos[v + 2] = P[k + 2] - cz;
      // Normal from central differences (float64), oriented outward.
      const l = at(i - 1, j), r = at(i + 1, j), d = at(i, j - 1), u = at(i, j + 1);
      const ax = P[r] - P[l], ay = P[r + 1] - P[l + 1], az = P[r + 2] - P[l + 2];
      const bx = P[u] - P[d], by = P[u + 1] - P[d + 1], bz = P[u + 2] - P[d + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      if (nx * P[k] + ny * P[k + 1] + nz * P[k + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      nor[v] = nx / len; nor[v + 1] = ny / len; nor[v + 2] = nz / len;
    }
    // Skirt vertices: border ring pushed down along the local vertical.
    const skirt = Math.max(30, tileSize * 0.015);
    const border: [number, number][] = [];
    for (let i = 0; i < n; i++) border.push([i, 0]);
    for (let j = 0; j < n; j++) border.push([n, j]);
    for (let i = n; i > 0; i--) border.push([i, n]);
    for (let j = n; j > 0; j--) border.push([0, j]);
    border.forEach(([i, j], e) => {
      const src = (j * row + i) * 3, dst = (row * row + e) * 3;
      const dx = dirs[src], dy = dirs[src + 1], dz = dirs[src + 2];
      pos[dst] = pos[src] - dx * skirt; pos[dst + 1] = pos[src + 1] - dy * skirt; pos[dst + 2] = pos[src + 2] - dz * skirt;
      nor[dst] = nor[src]; nor[dst + 1] = nor[src + 1]; nor[dst + 2] = nor[src + 2];
      dirs[dst] = dx; dirs[dst + 1] = dy; dirs[dst + 2] = dz;
      hgt[row * row + e] = hgt[j * row + i];
      det[(row * row + e) * 2] = det[(j * row + i) * 2];
      det[(row * row + e) * 2 + 1] = det[(j * row + i) * 2 + 1];
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setAttribute('dir', new BufferAttribute(dirs, 3));
    g.setAttribute('height', new BufferAttribute(hgt, 1));
    g.setAttribute('detail', new BufferAttribute(det, 2));
    g.setIndex(this.indices(n, this.outward[t.face]));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.material);
    mesh.position.set(cx, cy, cz);
    mesh.updateMatrixWorld();
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false; // culled by the quadtree
    mesh.renderOrder = 2;
    mesh.name = `tile-${t.key}`;
    return mesh;
  }

  private disposeMesh(t: Tile): void {
    if (!t.mesh) return;
    this.group.remove(t.mesh);
    t.mesh.geometry.dispose();
    t.mesh = null;
  }

  private evict(): void {
    let count = 0;
    for (const t of this.tiles.values()) if (t.mesh) count++;
    if (count <= this.opt.maxTiles) return;
    const old = [...this.tiles.values()].filter((t) => t.mesh && t.level > 0 && t.lastUsed < this.frame).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const t of old) {
      if (count <= this.opt.maxTiles) break;
      this.disposeMesh(t);
      this.tiles.delete(t.key);
      count--;
    }
  }

  /** Terrain height (m) under a direction, for the camera (uses the same function as the meshes). */
  heightAt(dir: Vector3): number {
    return Math.max(0, this.heights.height(dir, 30));
  }
}
