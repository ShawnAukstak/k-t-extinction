import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

const t = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__kt.clock.t as number);

test('plays in real time through the impact minute and pauses', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=-30&v=1');
  await waitForGlobe(page);
  const t0 = await t(page);
  await page.waitForTimeout(1500);
  const t1 = await t(page);
  expect(t1 - t0).toBeGreaterThan(0.8);
  expect(t1 - t0).toBeLessThan(3);
  await expect(page.getByTestId('timeline')).toContainText('real time');

  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await t(page);
  await page.waitForTimeout(500);
  expect(await t(page)).toBe(paused);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('p=1');
  await expectNoErrors(errors);
});

test('scrubbing the bar jumps through non-linear time', async ({ page }) => {
  await page.goto('/#t=0&p=1&v=1');
  await waitForGlobe(page);
  const track = page.getByRole('slider', { name: 'Simulation time' });
  const box = (await track.boundingBox())!;
  // Far right of the bar is the Recovery segment: hundreds of thousands of years.
  await page.mouse.click(box.x + box.width * 0.995, box.y + 6); // top edge: above the markers
  expect(await t(page)).toBeGreaterThan(1e5 * 365.25 * 86400);
  await expect(page.getByTestId('timeline')).toContainText('years');
  // Left edge is the approach.
  await page.mouse.click(box.x + 2, box.y + 6);
  expect(await t(page)).toBeLessThan(-600);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/t=-\d/);
});

test('next/previous event buttons and keyboard', async ({ page }) => {
  await page.goto('/#t=0&p=1&v=1');
  await waitForGlobe(page);
  await page.getByRole('button', { name: 'Next event' }).click();
  expect(await t(page)).toBe(10); // transient cavity
  await page.keyboard.press(']');
  expect(await t(page)).toBe(300); // peak ring
  await page.keyboard.press('[');
  expect(await t(page)).toBe(10);
  await page.getByRole('button', { name: 'Previous event' }).click();
  expect(await t(page)).toBe(0);
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  expect(await t(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Faster' }).click();
  expect(await page.evaluate(() => (window as any).__kt.clock.speed)).toBe(2);
});

test('the bar fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.goto('/#t=0&p=1&v=1');
  await waitForGlobe(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const bar = (await page.getByTestId('timeline').boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(vw);
});
