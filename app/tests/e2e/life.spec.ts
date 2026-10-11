import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

test('"Find dinosaurs nearby" flies down to a herd and opens its species card', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-60&p=1&k=tanis&v=1');
  await waitForGlobe(page);
  const panel = page.getByTestId('panel');
  await panel.getByRole('button', { name: 'Find dinosaurs nearby' }).click();
  await expect(panel).toContainText('Animal', { timeout: 30_000 });
  await expect(panel).toContainText(/\d+ m long/);
  await expect(panel.locator('.kt-sources a').first()).toBeVisible();
  const range = await page.evaluate(() => (window as any).__kt.controls.pose.range);
  expect(range).toBeLessThan(200);
  await expectNoErrors(errors);
});

test('tapping an animal opens its species card', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-60&p=1&c=51.686,-79.748,2500,150,60&v=1');
  await waitForGlobe(page);
  await expect.poll(() => page.evaluate(() => (window as any).__kt.herds.animals), { timeout: 30_000 }).toBeGreaterThan(50);
  // Drop the camera next to the nearest big herd and freeze time so the animals hold still.
  const target = await page.evaluate(async () => {
    const k = (window as any).__kt;
    const here = k.camera.position.clone().normalize();
    const h = k.herds.nearestHerd(here, k.clock.t);
    const lat = Math.asin(h.dir.y) * 180 / Math.PI, lon = Math.atan2(h.dir.x, h.dir.z) * 180 / Math.PI;
    k.clock.playing = false;
    k.controls.setPose({ lat, lon, range: h.species.lengthM * 6, heading: 0, tilt: 60 });
    return h.species.name as string;
  });
  // Project that animal's body (its torso, just above hip height) to the screen and click it.
  await expect.poll(async () => {
    const xy = await page.evaluate(() => {
      const k = (window as any).__kt;
      k.renderNow();
      const h = k.herds.nearestHerd(k.camera.position.clone().normalize(), k.clock.t);
      const p = h.pos.clone().addScaledVector(h.dir, h.species.hipHeightM * 1.08).project(k.camera);
      const r = k.renderer.domElement.getBoundingClientRect();
      return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height];
    });
    await page.mouse.click(xy[0], xy[1]);
    return page.getByTestId('panel').textContent();
  }, { timeout: 15_000 }).toContain(target);
  await expectNoErrors(errors);
});
