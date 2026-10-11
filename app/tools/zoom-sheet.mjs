// Dev tool: capture a zoom sequence at one place (fixed time), waiting for terrain tiles to settle.
//   node tools/zoom-sheet.mjs out.png lat lon heading tilt t range1 range2 ... [--size WxH]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const sizeIdx = args.indexOf('--size');
const [w, h] = (sizeIdx >= 0 ? args[sizeIdx + 1] : '640x400').split('x').map(Number);
const pos = sizeIdx >= 0 ? args.filter((_, i) => i !== sizeIdx && i !== sizeIdx + 1) : args;
const [out, lat, lon, heading, tilt, t, ...ranges] = pos;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
await page.goto(`http://127.0.0.1:5173/#t=${t}&p=1&c=${lat},${lon},${ranges[0]},${heading},${tilt}&v=1`);
await page.waitForFunction(() => window.__kt?.globe?.loadedSize > 0 && window.__kt.globe.heights.ready, null, { timeout: 30000 });
const dir = mkdtempSync(join(tmpdir(), 'kt-zoom-'));
const files = [];
for (const r of ranges) {
  await page.evaluate(([la, lo, rr, hd, tl]) => window.__kt.controls.setPose({ lat: +la, lon: +lo, range: +rr, heading: +hd, tilt: +tl }), [lat, lon, r, heading, tilt]);
  // Let the quadtree refine (builds are budgeted per frame).
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => ({ drawn: window.__kt.globe.terrain.drawn, level: window.__kt.globe.terrain.maxLevelDrawn }));
  console.log(`range ${r}: tiles ${stats.drawn}, max level ${stats.level}`);
  const f = join(dir, `z_${files.length}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
execFileSync('montage', [...files, '-tile', `${Math.min(3, files.length)}x`, '-geometry', '+2+2', '-background', '#222', out]);
console.log('wrote', out);
