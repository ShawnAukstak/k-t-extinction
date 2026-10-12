/**
 * Google Analytics, when the build includes it (GA_ID; vite.config.ts adds gtag.js to the page). A few
 * events say what people do with the simulator (moments and places opened, links shared); nothing personal.
 */
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window { gtag?: Gtag; __ktReplaceState?: History['replaceState'] }
}

export function track(event: string, params: Record<string, string | number> = {}): void {
  window.gtag?.('event', event, params);
}

/**
 * Change the address without it counting as a page view. The address follows playback (once a second),
 * and gtag.js counts history changes as page views, so this uses the browser's own replaceState, which
 * the page keeps from before gtag.js loaded.
 */
export function replaceUrl(url: string): void {
  (window.__ktReplaceState ?? history.replaceState.bind(history))(null, '', url);
}
