import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

test('searching a city shows where it was 66 million years ago', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#t=0&p=1&c=20,-60,16000000,0,0&v=1');
  await waitForGlobe(page);
  await page.getByTestId('places').click();
  const search = page.getByLabel('Search a city');
  await search.click();
  await search.fill('tok');
  await page.getByRole('button', { name: /^Tokyo/ }).click();
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Tokyo, Japan · 66 million years ago');
  await expect(panel).toContainText('km');
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toContain('qn=Tokyo, Japan');
  await expectNoErrors(errors);
});

test('"Use my location" reconstructs the device position locally', async ({ browser }) => {
  const context = await browser.newContext({ geolocation: { latitude: 51.5074, longitude: -0.1278 }, permissions: ['geolocation'] });
  const page = await context.newPage();
  await page.goto('./#t=0&p=1&c=20,-60,16000000,0,0&v=1');
  await waitForGlobe(page);
  await page.getByTestId('places').click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByTestId('panel')).toContainText('Where you are · 66 million years ago', { timeout: 15_000 });
  // London sat around 40° N at 65 Ma in PALEOMAP; check the query point moved south of today's 51.5° N.
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/q=[-\d.]+,[-\d.]+/);
  const q = await page.evaluate(() => { const m = location.hash.match(/q=([-\d.]+),([-\d.]+)/); return m ? [Number(m[1]), Number(m[2])] : null; });
  expect(q![0]).toBeLessThan(48);
  expect(q![0]).toBeGreaterThan(30);
  await context.close();
});
