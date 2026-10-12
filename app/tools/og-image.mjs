// Dev tool: render a frame without the interface, for the link-preview (Open Graph) image.
//   node tools/og-image.mjs out.jpg "#t=-1800&m=cine&p=1&v=1" [--size 1200x630] [--wait ms]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [out, hash] = args;
const [w, h] = get('--size', '1200x630').split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto(`http://127.0.0.1:5173/${hash}`);
await page.waitForFunction(() => window.__kt?.globe?.loadedSize >= 1024 || window.__kt?.globe?.loadedSize > 0, null, { timeout: 30000 });
await page.evaluate(() => window.__kt.effectsReady());
await page.waitForTimeout(Number(get('--wait', '4000')));
await page.addStyleTag({ content: '.kt-top-bar,.kt-hud,.kt-markers-layer,.kt-panel{display:none!important}' });
await page.waitForTimeout(300);
await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
await browser.close();
console.log('wrote', out);
