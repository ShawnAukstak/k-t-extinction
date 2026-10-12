import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

test('Explore opens moments; a moment goes to its time and view with its card, and the start restarts the cinematic', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=30000&c=40,-90,3000000,0,0&p=1&v=1');
  await waitForGlobe(page);
  await page.getByTestId('places').click();
  const strip = page.getByTestId('moments');
  await expect(strip).toBeVisible();
  const cards = strip.locator('[data-moment]');
  expect(await cards.count()).toBeGreaterThan(8);
  // Pictures load (lazily, once the panel is open).
  await expect.poll(() => strip.locator('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

  await strip.locator('[data-moment="curtain"]').click();
  await expect(page.getByTestId('panel')).toContainText('Transient crater');
  const st = await page.evaluate(() => { const k = (window as any).__kt; return { t: k.clock.t, mode: k.mode(), pose: k.controls.getPose(), playing: k.clock.playing }; });
  expect(st.t).toBeCloseTo(75, 0);
  expect(st.mode).toBe('free');
  expect(st.pose.lat).toBeCloseTo(25.6, 3);
  expect(st.pose.range).toBeCloseTo(900000, -2);
  expect(st.playing).toBe(false);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('t=75');

  await page.getByTestId('places').click();
  await page.getByTestId('moments').locator('[data-moment="start"]').click();
  const s2 = await page.evaluate(() => { const k = (window as any).__kt; return { t: k.clock.t, mode: k.mode(), playing: k.clock.playing, speed: k.clock.speed }; });
  expect(s2.mode).toBe('cine');
  expect(s2.playing).toBe(true);
  expect(s2.speed).toBe(1);
  expect(s2.t).toBeLessThan(-3500);
  await expect(page.getByTestId('panel')).toBeHidden();
  await expectNoErrors(errors);
});
