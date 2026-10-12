import { expect, test } from '@playwright/test';
import { expectNoErrors, trackErrors, waitForGlobe } from './helpers';

/** The Share button: top bar on desktop, the control bar on phones. */
const shareButton = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="share"]:visible, [data-testid="share-mini"]:visible').first();

test('Share freezes the moment and gives a link that reopens the same time and view', async ({ page, context }) => {
  const errors = trackErrors(page);
  await page.goto('/#t=900&c=40.5,-95.25,1800000,20,35&v=1');
  await waitForGlobe(page);
  expect(await page.evaluate(() => (window as any).__kt.clock.playing)).toBe(true);

  await shareButton(page).click();
  const sheet = page.getByTestId('share-sheet');
  await expect(sheet).toBeVisible();
  // Playback pauses while sharing, so the link, preview and screen agree.
  const t = await page.evaluate(() => (window as any).__kt.clock.t);
  expect(await page.evaluate(() => (window as any).__kt.clock.playing)).toBe(false);
  await expect(sheet.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);

  const url = await page.getByTestId('share-url').inputValue();
  expect(url).toMatch(/#t=\d+(\.\d)?&c=40\.5,-95\.25,1800000,20,35&m=free&p=1&v=1$/);
  await expect(sheet).toContainText('paused on this frame');

  // The other choice drops the pause.
  await sheet.getByRole('radio', { name: 'Playing from here' }).click();
  await expect(page.getByTestId('share-url')).not.toHaveValue(/p=1/);
  await sheet.getByRole('radio', { name: 'Paused here' }).click();

  await page.getByTestId('share-copy').click();
  await expect(page.getByTestId('share-copy')).toHaveText(/Copied|Copy link/);

  // Closing resumes playback.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => (window as any).__kt.clock.playing)).toBe(true);

  // The link opens at the same moment and pose, paused.
  const other = await context.newPage();
  await other.goto(url);
  await waitForGlobe(other);
  const st = await other.evaluate(() => { const k = (window as any).__kt; return { t: k.clock.t, playing: k.clock.playing, pose: k.controls.getPose() }; });
  expect(st.playing).toBe(false);
  // Links keep a tenth of a second below T+1000 s and whole seconds after (url-state.ts fmtTime).
  const linked = Number(/#t=([\d.]+)/.exec(url)![1]);
  expect(st.t).toBe(linked);
  expect(Math.abs(linked - t)).toBeLessThanOrEqual(t < 1000 ? 0.05 : 0.5);
  expect(st.pose.lat).toBeCloseTo(40.5, 4);
  expect(st.pose.heading).toBeCloseTo(20, 4);
  await expectNoErrors(errors);
});

test('sharing from the cinematic keeps the scripted camera', async ({ page }) => {
  await page.goto('/#t=-20&m=cine&p=1&v=1');
  await waitForGlobe(page);
  await shareButton(page).click();
  await expect(page.getByTestId('share-sheet')).toContainText('the cinematic camera');
  expect(await page.getByTestId('share-url').inputValue()).toMatch(/#t=-20&m=cine&p=1&v=1$/);
  // Space inside the sheet doesn't start playback behind it.
  await page.getByTestId('share-copy').focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as any).__kt.clock.playing)).toBe(false);
  await page.locator('.kt-share .kt-panel-close').click();
  await expect(page.getByTestId('share-sheet')).toBeHidden();
  // It was paused before sharing, so it stays paused.
  expect(await page.evaluate(() => (window as any).__kt.clock.playing)).toBe(false);
});
