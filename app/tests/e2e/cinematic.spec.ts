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

test('a tap during the opening asks what happened there and leaves the cinematic running', async ({ page }) => {
  await page.goto('/#t=-1800&p=1&m=cine&v=1');
  await waitForGlobe(page);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.width / 2, box.height / 2);
  await expect.poll(() => page.evaluate(() => (window as any).__kt.panel.kind)).toBe('location');
  expect(await page.evaluate(() => (window as any).__kt.mode())).toBe('cine');
  await expect(page.getByTestId('resume-cinematic')).toBeHidden();
});

test('dragging takes over the camera without a jump or a turn, and offers the way back', async ({ page }) => {
  await page.goto('/#t=-1800&p=1&m=cine&v=1');
  await waitForGlobe(page);
  const north = () => page.evaluate(() => {
    // Which way north points on screen at the ground below the camera (degrees from up).
    const k = (window as any).__kt;
    k.renderNow();
    const cam = k.camera;
    const ground = cam.position.clone().setLength(6_371_000);
    const u = ground.clone().normalize();
    const n = u.clone().set(0, 1, 0).addScaledVector(u, -u.y).normalize();
    const a = ground.clone().project(cam), b = ground.clone().addScaledVector(n, 50_000).project(cam);
    return Math.atan2((b.x - a.x) * cam.aspect, b.y - a.y) * 180 / Math.PI;
  });
  const before = await page.evaluate(() => (window as any).__kt.camera.position.toArray());
  const n0 = await north();
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.width / 2 + 3, box.height / 2); // within a tap's slop: still the cinematic
  expect(await page.evaluate(() => (window as any).__kt.mode())).toBe('cine');
  await page.mouse.move(box.width / 2 + 12, box.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__kt.mode())).toBe('free');
  const after = await page.evaluate(() => { const k = (window as any).__kt; k.renderNow(); return k.camera.position.toArray(); });
  // The view is kept: the globe the same size, north still up.
  const r = (p: number[]) => Math.hypot(p[0], p[1], p[2]);
  expect(r(after) / r(before)).toBeGreaterThan(0.85);
  expect(r(after) / r(before)).toBeLessThan(1.15);
  expect(Math.abs(n0)).toBeLessThan(30);
  expect(Math.abs(await north())).toBeLessThan(30);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('m=free');
  const resume = page.getByTestId('resume-cinematic');
  await expect(resume).toBeVisible();
  await resume.click();
  expect(await page.evaluate(() => (window as any).__kt.mode())).toBe('cine');
  await expect(resume).toBeHidden();
  await expect(page.getByTestId('cinematic-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('the cinematic button switches between the cinematic and a free camera', async ({ page }) => {
  await page.goto('/#t=600&p=1&m=cine&v=1');
  await waitForGlobe(page);
  const before = await page.evaluate(() => (window as any).__kt.camera.position.toArray());
  await page.getByTestId('cinematic-toggle').click();
  const after = await page.evaluate(() => { const k = (window as any).__kt; k.renderNow(); return { mode: k.mode(), pos: k.camera.position.toArray() }; });
  expect(after.mode).toBe('free');
  const d = Math.hypot(after.pos[0] - before[0], after.pos[1] - before[1], after.pos[2] - before[2]);
  expect(d).toBeLessThan(1000); // metres: the free camera starts where the cinematic was
  await expect(page.getByTestId('resume-cinematic')).toBeHidden(); // chosen, not grabbed
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

test('sound toggles on and off without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-3&p=0&m=cine&v=1');
  await waitForGlobe(page);
  const btn = page.getByTestId('sound-toggle');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(3500); // plays through the impact
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expectNoErrors(errors);
});
