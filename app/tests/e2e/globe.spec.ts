import { expect, test } from '@playwright/test';
import { expectNoErrors, pixelAt, trackErrors, waitForGlobe } from './helpers';

test('boots, loads the 66 Ma globe and renders it without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForGlobe(page);
  // Centre of the screen is the globe (lit, not black); a corner is space (dark).
  const centre = await pixelAt(page, 0.5, 0.5);
  const corner = await pixelAt(page, 0.02, 0.02);
  expect(centre[0] + centre[1] + centre[2]).toBeGreaterThan(90);
  expect(corner[0] + corner[1] + corner[2]).toBeLessThan(60);
  await expectNoErrors(errors);
});

test('a deep link sets the camera, and moving the camera updates the link', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#c=46,-79,2500000,15,20&t=120&v=1');
  await waitForGlobe(page);
  const pose = await page.evaluate(() => (window as any).__kt.controls.getPose());
  expect(pose.lat).toBeCloseTo(46, 5);
  expect(pose.lon).toBeCloseTo(-79, 5);
  expect(pose.range).toBeCloseTo(2_500_000, 0);
  expect(pose.heading).toBeCloseTo(15, 5);
  expect(pose.tilt).toBeCloseTo(20, 5);
  expect(await page.evaluate(() => (window as any).__kt.clock.t)).toBeGreaterThanOrEqual(120);

  // Drag the globe; the hash should follow after the debounce.
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.width / 2 + 120, box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/c=/);
  const moved = await page.evaluate(() => (window as any).__kt.controls.getPose());
  expect(moved.lon).not.toBeCloseTo(-79, 1);
  await expectNoErrors(errors);
});

test('the impact site is under the sea (DEM correction applied)', async ({ page }) => {
  await page.goto('/#c=25.1149,-71.5823,60000,0,0&v=1');
  await waitForGlobe(page);
  const [r, , b] = await pixelAt(page, 0.5, 0.5);
  expect(b).toBeGreaterThan(r); // water, not the PaleoDEM's raw +800 m land
});
