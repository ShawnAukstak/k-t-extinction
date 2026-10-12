/**
 * Foliage textures, drawn procedurally at start-up (no image files): a 1024² atlas of eight 256×512
 * tiles, each a cut-out (alpha) of one kind of foliage with leaf-to-leaf shading in RGB (grey; the
 * shader tints it). Forms follow the Maastrichtian floras (e.g. Hell Creek; Johnson 2002):
 *   0, 1  dicot angiosperm leaf clusters (ovate, entire or toothed; lobed platanoid)
 *   2     Metasequoia-like flat sprays of opposite linear needles (taxodiaceous conifers)
 *   3     scale-leaved, cord-like branchlets (araucarian / cheirolepid conifers)
 *   4     a bipinnate fern frond
 *   5     a costapalmate fan-palm leaf (Sabalites)
 *   6     a stiff pinnate cycad frond
 *   7     horsetail (Equisetum) stems with whorled branches
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three';

export const ATLAS = { cols: 4, rows: 2 } as const;
export const TILE = { broadleaf: 0, broadleafLobed: 1, conifer: 2, coniferScale: 3, fern: 4, palm: 5, cycad: 6, horsetail: 7 } as const;

/** UV rectangle [u0, v0, u1, v1] of a tile (v up, as three.js expects). */
export function tileUV(tile: number): [number, number, number, number] {
  const c = tile % ATLAS.cols, r = Math.floor(tile / ATLAS.cols);
  const u0 = c / ATLAS.cols, u1 = (c + 1) / ATLAS.cols;
  const v1 = 1 - r / ATLAS.rows, v0 = 1 - (r + 1) / ATLAS.rows;
  // Half a texel in, so mip filtering doesn't bleed between tiles.
  const e = 1 / 1024;
  return [u0 + e, v0 + e, u1 - e, v1 - e];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

type Ctx = CanvasRenderingContext2D;

function grey(v: number): string {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${g},${g},${g})`;
}

/** An ovate leaf with a midrib, at (x, y), length len, angle a (radians, 0 = up). */
function leaf(g: Ctx, x: number, y: number, len: number, wid: number, a: number, shade: number, toothed = false): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(0, 0);
  const steps = toothed ? 9 : 1;
  if (toothed) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, w = wid * Math.sin(Math.PI * Math.pow(t, 0.8)) * (i % 2 ? 1 : 0.85);
      g.lineTo(w, -len * t);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps, w = wid * Math.sin(Math.PI * Math.pow(t, 0.8)) * (i % 2 ? 1 : 0.85);
      g.lineTo(-w, -len * t);
    }
  } else {
    g.bezierCurveTo(wid * 1.3, -len * 0.3, wid * 0.9, -len * 0.8, 0, -len);
    g.bezierCurveTo(-wid * 0.9, -len * 0.8, -wid * 1.3, -len * 0.3, 0, 0);
  }
  g.fillStyle = grey(shade);
  g.fill();
  // Midrib, a little darker.
  g.strokeStyle = grey(shade * 0.7);
  g.lineWidth = Math.max(1, wid * 0.12);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.92); g.stroke();
  g.restore();
}

function stem(g: Ctx, pts: [number, number][], w: number, shade: number): void {
  g.strokeStyle = grey(shade);
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.stroke();
}

function broadleafCluster(g: Ctx, W: number, H: number, seed: number, lobed: boolean): void {
  const r = rng(seed);
  // Twigs radiating from the bottom centre, leaves all along them: a dense, rounded spray.
  const cx = W / 2, cy = H * 0.97;
  for (let k = 0; k < 9; k++) {
    const a = -1.2 + (k / 8) * 2.4 + (r() - 0.5) * 0.2;
    const len = H * (0.55 + 0.35 * r());
    const ex = cx + Math.sin(a) * len * 0.5, ey = cy - Math.cos(a) * len;
    stem(g, [[cx, cy], [ex, ey]], 3, 0.3);
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = cx + (ex - cx) * t, py = cy + (ey - cy) * t;
      for (const side of [-1, 1]) {
        const la = a + side * (0.7 + 0.4 * r());
        const L = (lobed ? 46 : 38) * (0.75 + 0.5 * r()) * (1 - 0.3 * t);
        leaf(g, px, py, L, L * (lobed ? 0.55 : 0.36), la, 0.45 + 0.55 * r(), lobed || r() < 0.3);
      }
    }
    leaf(g, ex, ey, 40, 14, a, 0.5 + 0.5 * r());
  }
}

function coniferSpray(g: Ctx, W: number, H: number, seed: number): void {
  const r = rng(seed);
  // A drooping branch: a main axis with flat sprays of paired needles (Metasequoia-like).
  const axis: [number, number][] = [];
  for (let i = 0; i <= 12; i++) axis.push([W / 2 + Math.sin(i * 0.35) * 8, H * 0.98 - (H * 0.95 * i) / 12]);
  stem(g, axis, 4, 0.28);
  for (let i = 1; i < 12; i++) {
    const [x, y] = axis[i];
    for (const side of [-1, 1]) {
      const len = (W * 0.44) * Math.sin(Math.PI * (i / 12)) * (0.8 + 0.3 * r());
      const a = side * (1.05 + 0.25 * r());
      const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
      stem(g, [[x, y], [ex, ey]], 2, 0.3);
      const n = Math.max(4, Math.floor(len / 6));
      for (let k = 1; k <= n; k++) {
        const t = k / n, px = x + (ex - x) * t, py = y + (ey - y) * t;
        for (const s2 of [-1, 1]) {
          const na = a + s2 * 1.35;
          const L = 13 * (1 - 0.5 * t) * (0.8 + 0.3 * r());
          g.strokeStyle = grey(0.45 + 0.5 * r());
          g.lineWidth = 3;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(na) * L, py - Math.cos(na) * L); g.stroke();
        }
      }
    }
  }
}

function coniferScale(g: Ctx, W: number, H: number, seed: number): void {
  const r = rng(seed);
  // Cord-like branchlets covered in overlapping scale leaves (Araucaria / Brachyphyllum).
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    const n = Math.floor(len / (w * 0.9));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      g.fillStyle = grey(0.4 + 0.55 * r());
      g.beginPath();
      g.ellipse(x + (ex - x) * t, y + (ey - y) * t, w * 0.62, w * 0.75, a, 0, Math.PI * 2);
      g.fill();
    }
    if (depth > 0) for (let k = 1; k <= 4; k++) {
      const t = k / 5;
      branch(x + (ex - x) * t, y + (ey - y) * t, a + (k % 2 ? 1 : -1) * (0.6 + 0.3 * r()), len * 0.45 * (1 - t * 0.4), w * 0.7, depth - 1);
    }
  };
  branch(W / 2, H * 0.98, (r() - 0.5) * 0.2, H * 0.9, 14, 2);
}

function fernFrond(g: Ctx, W: number, H: number, seed: number): void {
  const r = rng(seed);
  // Bipinnate: pinnae along the rachis, each with pinnules; tapering to the tip.
  const n = 22;
  const rachis: [number, number][] = [];
  for (let i = 0; i <= n; i++) rachis.push([W / 2 + Math.sin(i * 0.2) * 6, H * 0.99 - (H * 0.96 * i) / n]);
  stem(g, rachis, 4, 0.35);
  for (let i = 2; i < n; i++) {
    const [x, y] = rachis[i];
    const t = i / n;
    const len = W * 0.47 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (0.85 + 0.2 * r());
    for (const side of [-1, 1]) {
      const a = side * (1.15 - 0.3 * t);
      const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
      stem(g, [[x, y], [ex, ey]], 1.5, 0.35);
      const m = Math.max(3, Math.floor(len / 7));
      for (let k = 1; k <= m; k++) {
        const u = k / m, px = x + (ex - x) * u, py = y + (ey - y) * u;
        for (const s2 of [-1, 1]) leaf(g, px, py, 10 * (1 - 0.6 * u), 3.6 * (1 - 0.5 * u), a + s2 * 1.1 - side * 0.2, 0.45 + 0.5 * r());
      }
    }
  }
}

function palmFan(g: Ctx, W: number, H: number, seed: number): void {
  const r = rng(seed);
  // Costapalmate fan (Sabalites): a petiole, then a fan of folded segments with split tips.
  const px = W / 2, py = H * 0.98, hx = W / 2, hy = H * 0.5;
  stem(g, [[px, py], [hx, hy]], 6, 0.4);
  const segs = 26;
  for (let i = 0; i < segs; i++) {
    const a = -1.45 + (2.9 * i) / (segs - 1);
    const len = H * 0.47 * (0.85 + 0.15 * Math.cos(a)) * (0.92 + 0.12 * r());
    const ex = hx + Math.sin(a) * len, ey = hy - Math.cos(a) * len;
    const w = 7.5;
    g.fillStyle = grey(0.45 + 0.5 * r());
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(hx + Math.sin(a - 0.06) * len * 0.92 + Math.cos(a) * w, hy - Math.cos(a - 0.06) * len * 0.92 + Math.sin(a) * w);
    g.lineTo(ex, ey);
    g.lineTo(hx + Math.sin(a + 0.06) * len * 0.92 - Math.cos(a) * w, hy - Math.cos(a + 0.06) * len * 0.92 - Math.sin(a) * w);
    g.closePath();
    g.fill();
  }
}

function cycadFrond(g: Ctx, W: number, H: number, seed: number): void {
  const r = rng(seed);
  const n = 28;
  const rachis: [number, number][] = [];
  for (let i = 0; i <= n; i++) rachis.push([W / 2, H * 0.99 - (H * 0.97 * i) / n]);
  stem(g, rachis, 5, 0.35);
  for (let i = 2; i < n; i++) {
    const [x, y] = rachis[i];
    const t = i / n;
    const len = W * 0.46 * Math.sin(Math.PI * Math.min(1, 0.15 + t)) * (0.95 + 0.1 * r());
    for (const side of [-1, 1]) leaf(g, x, y, len, 4, side * (1.0 - 0.25 * t), 0.4 + 0.5 * r());
  }
}

function horsetail(g: Ctx, W: number, H: number, seed: number): void {
  const r = rng(seed);
  for (let k = 0; k < 7; k++) {
    const x0 = W * (0.2 + 0.6 * r()), lean = (r() - 0.5) * 0.25;
    const h = H * (0.6 + 0.38 * r());
    const pts: [number, number][] = [[x0, H]];
    const nodes = 9;
    for (let i = 1; i <= nodes; i++) pts.push([x0 + lean * h * (i / nodes), H - (h * i) / nodes]);
    stem(g, pts, 5, 0.5 + 0.3 * r());
    for (let i = 2; i < nodes; i++) {
      const [x, y] = pts[i];
      g.strokeStyle = grey(0.25);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke();
      for (const side of [-1, 1]) {
        g.strokeStyle = grey(0.4 + 0.4 * r());
        g.lineWidth = 1.5;
        const L = 24 * (1 - i / nodes) + 6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + side * L, y - L * 0.6); g.stroke();
      }
    }
  }
}

/** Draw the atlas (browser only). */
export function makeFoliageAtlas(): CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, size, size);
  const W = size / ATLAS.cols, H = size / ATLAS.rows;
  const draw: ((g: Ctx, W: number, H: number) => void)[] = [
    (c, w, h) => broadleafCluster(c, w, h, 11, false),
    (c, w, h) => broadleafCluster(c, w, h, 29, true),
    (c, w, h) => coniferSpray(c, w, h, 5),
    (c, w, h) => coniferScale(c, w, h, 7),
    (c, w, h) => fernFrond(c, w, h, 13),
    (c, w, h) => palmFan(c, w, h, 17),
    (c, w, h) => cycadFrond(c, w, h, 19),
    (c, w, h) => horsetail(c, w, h, 23),
  ];
  draw.forEach((fn, i) => {
    g.save();
    g.translate((i % ATLAS.cols) * W, Math.floor(i / ATLAS.cols) * H);
    g.beginPath(); g.rect(2, 2, W - 4, H - 4); g.clip();
    fn(g, W, H);
    g.restore();
  });
  const t = new CanvasTexture(canvas);
  t.colorSpace = NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 4;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}
