import { expect, type Page } from '@playwright/test';

/** Collect console errors and page errors for the lifetime of the page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon\.ico/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Wait until the app has booted and the globe textures are on the GPU. */
export async function waitForGlobe(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__kt?.globe?.loadedSize > 0, null, { timeout: 30_000 });
}

/** Render one frame and read back an RGBA pixel at a fraction of the canvas (0–1, origin top-left). */
export async function pixelAt(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.evaluate(([x, y]) => {
    const k = (window as any).__kt;
    k.renderNow();
    const gl: WebGL2RenderingContext = k.renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(x * gl.drawingBufferWidth), Math.floor((1 - y) * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Array.from(px);
  }, [fx, fy]);
}

export async function expectNoErrors(errors: string[]): Promise<void> {
  expect(errors, errors.join('\n')).toEqual([]);
}
