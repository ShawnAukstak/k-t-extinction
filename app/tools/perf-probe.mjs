// Dev tool: frame time and pixel ratio while playing at a few views (desktop Chromium on the real GPU).
// The app trades pixel ratio for frame time, so compare both.
//   node tools/perf-probe.mjs "#t=-3600&m=cine" "#t=600&c=..." ... [--size WxH] [--secs 4]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const si = args.indexOf('--size'), ti = args.indexOf('--secs');
const [w, h] = (si >= 0 ? args[si + 1] : '1280x800').split('x').map(Number);
const secs = ti >= 0 ? Number(args[ti + 1]) : 4;
const drop = new Set([si, ti].filter((i) => i >= 0).flatMap((i) => [i, i + 1]));
const hashes = args.filter((_, i) => !drop.has(i));
// Uncapped frame rate, so frame time shows the real cost rather than vsync; DPR 2 like a laptop.
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
for (const hash of hashes) {
  await page.goto(`http://127.0.0.1:5173/${hash.startsWith('#') ? hash : '#' + hash}`);
  await page.waitForFunction(() => window.__kt?.globe?.loadedSize > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2500); // let LOD, plants and the resolution settle
  const r = await page.evaluate((ms) => new Promise((res) => {
    const times = [];
    let last = performance.now();
    const end = last + ms;
    const tick = (now) => {
      times.push(now - last); last = now;
      if (now < end) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        const k = window.__kt;
        res({ median: times[times.length >> 1], p95: times[Math.floor(times.length * 0.95)], pr: k.renderer.getPixelRatio(), calls: k.renderer.info.render.calls, tris: k.renderer.info.render.triangles });
      }
    };
    requestAnimationFrame(tick);
  }), secs * 1000);
  console.log(`${hash.padEnd(48)} median ${r.median.toFixed(1)} ms  p95 ${r.p95.toFixed(1)} ms  pixelRatio ${r.pr}  draws ${r.calls}  tris ${(r.tris / 1000).toFixed(0)}k`);
}
await browser.close();
