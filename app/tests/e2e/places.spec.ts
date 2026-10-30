import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

test('Places menu flies to a site and opens its card', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#t=0&p=1&c=20,-60,16000000,0,0&v=1');
  await waitForGlobe(page);
  await page.getByTestId('places').click();
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Where to look');
  await panel.getByRole('button', { name: /^Tanis, North Dakota/ }).click();
  await expect(panel).toContainText('seismic surge');
  await expect(panel).toContainText('PALEOMAP');
  // The camera arrives over Tanis's 65 Ma position.
  await expect.poll(async () => page.evaluate(() => {
    const k = (window as any).__kt;
    return k.controls.flying ? 999 : Math.hypot(k.controls.pose.lat - 51.674, k.controls.pose.lon + 79.599);
  }), { timeout: 10_000 }).toBeLessThan(0.05);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('k=tanis');
  // "What happened here?" from the place card.
  await panel.getByRole('button', { name: 'What happened here?' }).click();
  await expect(panel).toContainText('Earthquake');
  await expectNoErrors(errors);
});

test('a place link opens directly, and markers sit under the controls', async ({ page }) => {
  await page.goto('./#t=0&p=1&k=el-kef&v=1');
  await waitForGlobe(page);
  await expect(page.getByTestId('panel')).toContainText('El Kef');
  const z = await page.evaluate(() => [
    getComputedStyle(document.querySelector('.kt-markers-layer')!).zIndex,
    getComputedStyle(document.querySelector('.kt-top-bar')!).zIndex,
  ]);
  expect(Number(z[0])).toBeLessThan(Number(z[1]));
});
