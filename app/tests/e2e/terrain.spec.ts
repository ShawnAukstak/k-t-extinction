import { expect, test } from '@playwright/test';
import { expectNoErrors, pixelAt, trackErrors, waitForGlobe } from './helpers';

test('zooming into the paleo-Rockies refines the terrain to fine tiles, camera above ground', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-60&p=1&c=46.8,-95,4000,30,70&v=1');
  await waitForGlobe(page);
  await page.waitForFunction(() => (window as any).__kt.globe.heights.ready);
  await expect.poll(() => page.evaluate(() => (window as any).__kt.globe.terrain.maxLevelDrawn), { timeout: 15_000 }).toBeGreaterThanOrEqual(11);
  const clearance = await page.evaluate(() => {
    const k = (window as any).__kt;
    const p = k.camera.position;
    const up = p.clone().normalize();
    return p.length() - (6_371_000 + k.globe.terrain.heightAt(up));
  });
  expect(clearance).toBeGreaterThan(5);
  // The lower half of the view is ground (not the black of space or a hole in the terrain).
  const [r, g, b] = await pixelAt(page, 0.5, 0.75);
  expect(r + g + b).toBeGreaterThan(60);
  expect(g).toBeGreaterThan(b * 0.8); // land, not sea
  await expectNoErrors(errors);
});
