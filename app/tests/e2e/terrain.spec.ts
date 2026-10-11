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

test('plants grow near the ground and only there', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-60&p=1&c=51.674,-79.599,500,150,80&v=1'); // Tanis, Hell Creek floodplain forest
  await waitForGlobe(page);
  await expect.poll(() => page.evaluate(() => (window as any).__kt.vegetation.instances), { timeout: 20_000 }).toBeGreaterThan(1000);
  expect(await page.evaluate(() => (window as any).__kt.vegetation.group.visible)).toBe(true);
  // From orbit there are no plants to draw.
  await page.evaluate(() => (window as any).__kt.controls.setPose({ lat: 51.674, lon: -79.599, range: 2_000_000, heading: 0, tilt: 0 }));
  await expect.poll(() => page.evaluate(() => { const k = (window as any).__kt; k.renderNow(); return k.vegetation.group.visible; })).toBe(false);
  await expectNoErrors(errors);
});
