// Dev tool: capture the app at several simulation times and tile them into one image.
//   node tools/contact-sheet.mjs out.png "lat,lon,range,heading,tilt"|cine t1 t2 t3 ... [--overlay] [--size 640x400] [--webkit]
import { chromium, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const sizeArg = args.find((a, i) => args[i - 1] === '--size') ?? '640x400';
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--size');
const [out, cam, ...times] = pos;
const [w, h] = sizeArg.split('x').map(Number);
const engine = flags.has('--webkit') ? webkit : chromium;
const browser = await engine.launch({ args: engine === chromium ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
const q = flags.has('--overlay') ? '?overlay=1' : '';
const camPart = cam === 'cine' ? 'm=cine' : `c=${cam}`;
await page.goto(`http://127.0.0.1:5173/${q}#t=${times[0]}&p=1&${camPart}&v=1`);
await page.waitForFunction(() => window.__kt?.globe?.loadedSize > 0, null, { timeout: 30000 });
await page.waitForTimeout(800);
const dir = mkdtempSync(join(tmpdir(), 'kt-sheet-'));
const files = [];
for (const t of times) {
  await page.evaluate((tt) => window.__kt.clock.seek(Number(tt)), t);
  await page.waitForTimeout(250);
  const f = join(dir, `t_${files.length}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
execFileSync('montage', [...files, '-tile', `${Math.min(4, files.length)}x`, '-geometry', '+2+2', '-background', '#222', out]);
console.log('wrote', out);
