// Dev tool: ground-level screenshots at one place across several times.
//   node tools/ground-shot.mjs out.png lat lon range heading tilt t1 t2 ... [--size WxH]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const args = process.argv.slice(2);
const si = args.indexOf('--size');
const [w, h] = (si >= 0 ? args[si + 1] : '640x400').split('x').map(Number);
const pos = si >= 0 ? args.filter((_, i) => i !== si && i !== si + 1) : args;
const [out, lat, lon, range, heading, tilt, ...times] = pos;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
await page.goto(`http://127.0.0.1:5173/#t=${times[0]}&p=1&c=${lat},${lon},${range},${heading},${tilt}&v=1`);
await page.waitForFunction(() => window.__kt?.globe?.heights?.ready, null, { timeout: 30000 });
await page.evaluate(() => window.__kt.effectsReady());
await page.waitForTimeout(4000);
const dir = mkdtempSync(join(tmpdir(), 'kt-ground-'));
const files = [];
for (const t of times) {
  await page.evaluate((tt) => window.__kt.clock.seek(Number(tt)), t);
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ plants: window.__kt.vegetation.instances, level: window.__kt.globe.terrain.maxLevelDrawn }));
  console.log(`t=${t}: plants ${st.plants}, terrain level ${st.level}`);
  const f = join(dir, `g_${files.length}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
execFileSync('montage', [...files, '-tile', `${Math.min(3, files.length)}x`, '-geometry', '+2+2', '-background', '#222', out]);
console.log('wrote', out);
