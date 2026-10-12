// Dev tool: close-ups of each species living around a place, with its card, as one contact sheet.
//   node tools/animal-sheet.mjs out.png lat lon [maxSpecies] [--size WxH] [--t seconds]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const args = process.argv.slice(2);
const si = args.indexOf('--size'), ti = args.indexOf('--t');
const [w, h] = (si >= 0 ? args[si + 1] : '800x500').split('x').map(Number);
const t = ti >= 0 ? Number(args[ti + 1]) : -60;
const drop = new Set([si, ti].filter((i) => i >= 0).flatMap((i) => [i, i + 1]));
const pos = args.filter((_, i) => !drop.has(i));
const [out, lat, lon, maxN = '8'] = pos;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
await page.goto(`http://127.0.0.1:5173/#t=${t}&p=1&c=${lat},${lon},3000,0,60&v=1`);
await page.waitForFunction(() => window.__kt?.globe?.heights?.ready, null, { timeout: 30000 });
await page.waitForFunction(() => window.__kt.herds.animals > 0, null, { timeout: 30000 }).catch(() => console.log('no animals here'));
await page.waitForTimeout(3000);
// One live herd per species, nearest first.
const alive = (a, t) => t >= a.bornAt && (t < a.dieAt || (a.rebornAt !== undefined && t >= a.rebornAt));
const herds = await page.evaluate(({ t, alive }) => {
  const k = window.__kt, here = k.camera.position.clone().normalize(), seen = new Map(), live = eval(alive);
  for (const c of k.herds.cells.values()) for (const hd of c.herds) {
    if (!hd.animals.some((a) => live(a, t))) continue;
    const d = hd.base.dot(here);
    const cur = seen.get(hd.species.id);
    if (!cur || d > cur.d) seen.set(hd.species.id, { d, id: hd.species.id, name: hd.species.name, base: hd.base.toArray(), len: hd.species.lengthM });
  }
  return [...seen.values()].sort((a, b) => b.d - a.d);
}, { t, alive: alive.toString() });
console.log('species here:', herds.map((x) => x.id).join(', '));
const dir = mkdtempSync(join(tmpdir(), 'kt-animals-'));
const files = [];
for (const hd of herds.slice(0, Number(maxN))) {
  const ok = await page.evaluate(async ({ hd, t, alive }) => {
    const k = window.__kt, live = eval(alive);
    // Find this species' first animal alive now (live position) and frame it.
    for (const c of k.herds.cells.values()) for (const [id, m] of c.meshes) {
      const i = id === hd.id ? m.items.findIndex((x) => live(x.a, t)) : -1;
      if (i < 0) continue;
      const p = k.herds.livePosition(c, id, i);
      const up = p.clone().normalize();
      const lat = Math.asin(up.y) * 180 / Math.PI, lon = Math.atan2(up.x, up.z) * 180 / Math.PI;
      k.clock.playing = false;
      k.controls.setPose({ lat, lon, range: Math.max(6, hd.len * 4.5), heading: 40, tilt: 72 });
      k.panel.close?.();
      return true;
    }
    return false;
  }, { hd, t, alive: alive.toString() });
  if (!ok) continue;
  await page.waitForTimeout(1500);
  const f = join(dir, `a_${files.length}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
const cols = Math.min(3, files.length);
execFileSync('magick', ['montage', ...files, '-tile', `${cols}x`, '-geometry', '+2+2', '-background', '#222', out]);
console.log('wrote', out);
await browser.close();
