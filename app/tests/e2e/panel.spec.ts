import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

test('tapping the globe answers "what happened here?" and rows seek the timeline', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#t=0&p=1&c=45,-80,8000000,0,0&v=1');
  await waitForGlobe(page);
  await page.evaluate(() => (window as any).__kt.effectsReady());
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const panel = page.getByTestId('panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('What happened here?');
  await expect(panel).toContainText('km');
  await expect(panel).toContainText('Earthquake');
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/q=4\d(\.\d+)?,-[78]\d/);
  // Rows jump the timeline.
  await panel.getByText('Falling ejecta').click();
  const t = await page.evaluate(() => (window as any).__kt.clock.t);
  expect(t).toBeGreaterThan(60);
  expect(t).toBeLessThan(3600);
  // Closing clears the marker and the link.
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('q=');
  await expectNoErrors(errors);
});

test('a shared location link opens the card', async ({ page }) => {
  await page.goto('./#t=1200&p=1&c=40,-75,9000000,0,0&q=51.674,-79.599&v=1');
  await waitForGlobe(page);
  await expect(page.getByTestId('panel')).toContainText('3,0', { timeout: 15_000 });
  await expect(page.getByTestId('panel')).toContainText('Coldest');
});

test('event cards show confidence and link their sources', async ({ page }) => {
  await page.goto('./#t=0&p=1&v=1');
  await waitForGlobe(page);
  await page.getByRole('button', { name: 'Next event' }).click();
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Transient crater');
  await expect(panel.locator('.kt-chip')).toHaveText(/Model/);
  const link = panel.locator('.kt-sources a').first();
  await expect(link).toHaveAttribute('href', /^https:\/\/doi\.org\//);
});

test('switching the darkening agent reloads the winter and is kept in the link', async ({ page }) => {
  await page.goto('./#t=3e7&p=1&v=1');
  await waitForGlobe(page);
  await page.evaluate(() => (window as any).__kt.effectsReady());
  const soot = await page.evaluate(() => { const k = (window as any).__kt; k.renderNow(); return k.fx.meanLight; });
  await page.getByLabel('Impact winter scenario').selectOption('so2');
  await expect.poll(() => page.evaluate(() => (window as any).__kt.fx.scenario)).toBe('so2');
  const so2 = await page.evaluate(() => { const k = (window as any).__kt; k.renderNow(); return k.fx.meanLight; });
  expect(so2).toBeGreaterThan(soot + 0.1);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('w=so2');
});

test('About lists data credits (CC BY attribution)', async ({ page }) => {
  await page.goto('./#t=0&p=1&v=1');
  await waitForGlobe(page);
  await page.getByTestId('about').click();
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Scotese');
  await expect(panel).toContainText('Range');
  await expect(panel).toContainText('Paleobiology Database');
});

test('top bar and panel fit a phone screen', async ({ page }) => {
  await page.goto('./#t=1200&p=1&c=40,-75,9000000,0,0&q=51.674,-79.599&v=1');
  await waitForGlobe(page);
  await expect(page.getByTestId('panel')).toBeVisible({ timeout: 15_000 });
  const vw = page.viewportSize()!.width;
  for (const sel of ['.kt-top-bar', '[data-testid="panel"]', '[data-testid="timeline"]']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.x, sel).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(vw + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
