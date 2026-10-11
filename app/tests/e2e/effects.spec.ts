import { expect, test } from '@playwright/test';
import { expectNoErrors, pixelAt, trackErrors, waitForGlobe } from './helpers';

const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('the fireball appears at impact and not before', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-10&p=1&c=25.1149,-71.5823,3000000,0,0&v=1');
  await waitForGlobe(page);
  const before = lum(await pixelAt(page, 0.5, 0.5));
  await page.evaluate(() => (window as any).__kt.clock.seek(4));
  const during = lum(await pixelAt(page, 0.5, 0.5));
  expect(during).toBeGreaterThan(230);
  expect(before).toBeLessThan(160);
  await expectNoErrors(errors);
});

test('the dust cloud has spread over North America by one hour', async ({ page }) => {
  await page.goto('/#t=-10&p=1&c=40,-80,7000000,0,0&v=1');
  await waitForGlobe(page);
  await page.waitForFunction(() => (window as any).__kt.fx.uniforms.uDustOn.value === 1);
  const clear = await pixelAt(page, 0.5, 0.5);
  await page.evaluate(() => (window as any).__kt.clock.seek(3600));
  const dusty = await pixelAt(page, 0.5, 0.5);
  // Dust is grey-brown: the green/blue of the surface is suppressed relative to red.
  const greenness = (p: number[]) => p[1] - p[0];
  expect(greenness(dusty)).toBeLessThan(greenness(clear));
});
