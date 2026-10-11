import { expect, test } from '@playwright/test';
import { expectNoErrors, pixelAt, trackErrors, waitForGlobe } from './helpers';

test('lands in the cinematic, an hour out, playing, with Earth in view', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForGlobe(page);
  const k = () => page.evaluate(() => { const k = (window as any).__kt; return { mode: k.mode(), t: k.clock.t, playing: k.clock.playing }; });
  const s = await k();
  expect(s.mode).toBe('cine');
  expect(s.playing).toBe(true);
  expect(s.t).toBeLessThan(-600); // the approach plays an hour in ~12 s
  await expect(page.getByTestId('cinematic-toggle')).toHaveAttribute('aria-pressed', 'true');
  // Earth is somewhere in the frame: sample a grid and expect lit pixels.
  let lit = 0;
  for (const fx of [0.2, 0.4, 0.6, 0.8]) for (const fy of [0.15, 0.3, 0.45, 0.6]) {
    const [r, g, b] = await pixelAt(page, fx, fy);
    if (r + g + b > 120) lit++;
  }
  expect(lit).toBeGreaterThan(0);
  await expectNoErrors(errors);
});

test('the asteroid is on its trajectory and gone after impact', async ({ page }) => {
  await page.goto('/#t=-10&p=1&m=cine&v=1');
  await waitForGlobe(page);
  const at = (t: number) => page.evaluate((tt) => {
    const k = (window as any).__kt;
    k.clock.seek(tt);
    k.renderNow();
    return { alt: k.asteroid.altitude, visible: k.asteroid.group.visible };
  }, t);
  const a = await at(-6);
  expect(a.visible).toBe(true);
  // 20 km/s at 60° → ~104 km altitude 6 s before impact
  expect(a.alt / 1000).toBeGreaterThan(95);
  expect(a.alt / 1000).toBeLessThan(115);
  expect((await at(0)).alt).toBeLessThan(2000);
  expect((await at(5)).visible).toBe(false);
});

test('dragging takes over the camera without a jump, and the button returns to the cinematic', async ({ page }) => {
  await page.goto('/#t=600&p=1&m=cine&v=1');
  await waitForGlobe(page);
  const before = await page.evaluate(() => (window as any).__kt.camera.position.toArray());
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const after = await page.evaluate(() => { const k = (window as any).__kt; k.renderNow(); return { mode: k.mode(), pos: k.camera.position.toArray() }; });
  expect(after.mode).toBe('free');
  const d = Math.hypot(after.pos[0] - before[0], after.pos[1] - before[1], after.pos[2] - before[2]);
  expect(d).toBeLessThan(50_000); // metres; continuity when taking over
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('m=free');
  await page.getByTestId('cinematic-toggle').click();
  expect(await page.evaluate(() => (window as any).__kt.mode())).toBe('cine');
});

test('the first view does not download the large effect files', async ({ page }) => {
  const big: string[] = [];
  page.on('request', (r) => { if (/tsunami\.bin|winter_.*\.bin/.test(r.url())) big.push(r.url()); });
  await page.goto('/#t=-3600&p=1&m=cine&v=1');
  await waitForGlobe(page);
  await page.waitForTimeout(1500);
  expect(big).toEqual([]);
  await page.evaluate(() => (window as any).__kt.clock.seek(7200));
  await expect.poll(() => big.some((u) => u.includes('tsunami'))).toBe(true);
});
