// Dev tool: screenshot the model sheet (dev/models.html) — every species' body, side and 3/4 view.
//   node tools/model-sheet.mjs out.png [--lod hi|lo] [--only id,id] [--view side,threequarter] [--size WxH]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = args[0];
const [w, h] = get('--size', '1800x1600').split('x').map(Number);
const qs = new URLSearchParams({ lod: get('--lod', 'hi'), view: get('--view', 'side,threequarter') });
if (get('--only')) qs.set('only', get('--only'));
qs.set('tile', get('--tile', '300'));
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto(`http://127.0.0.1:5173/dev/models.html?${qs}`);
await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
console.log(await page.evaluate(() => window.__done));
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
