// Render the Explore cards' pictures: opens each moment in the app and saves public/moments/<id>.jpg
// (320×180, the interface hidden). Needs the dev server.
//   node tools/moment-thumbs.mjs [id ...]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const app = fileURLToPath(new URL('..', import.meta.url));
const { moments } = parse(readFileSync(join(app, '../data/curated/moments.yaml'), 'utf8'));
const only = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const dir = mkdtempSync(join(tmpdir(), 'kt-moments-'));
for (const m of moments.filter((x) => !only.length || only.includes(x.id))) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(`http://127.0.0.1:5173/#t=-3600&p=1&v=1`);
  await page.waitForFunction(() => window.__kt?.globe?.loadedSize > 0, null, { timeout: 30000 });
  await page.evaluate(() => window.__kt.effectsReady());
  await page.evaluate((id) => window.__kt.goMoment(id), m.id);
  if (m.action === 'animals') {
    await page.waitForFunction(() => window.__kt.panel.kind === 'species', null, { timeout: 40000 }).catch(() => console.log(m.id, ': no animals found'));
  }
  await page.waitForTimeout(m.action ? 3000 : m.view.includes('k=') ? 9000 : 5000);
  await page.evaluate(() => { window.__kt.clock.setPlaying(false); });
  await page.addStyleTag({ content: '.kt-top-bar,.kt-hud,.kt-markers-layer,.kt-panel{display:none!important}' });
  await page.waitForTimeout(400);
  const f = join(dir, `${m.id}.png`);
  await page.screenshot({ path: f });
  execFileSync('magick', [f, '-resize', '320x180', '-quality', '78', join(app, 'public/moments', `${m.id}.jpg`)]);
  console.log('wrote', m.id);
  await page.close();
}
await browser.close();
