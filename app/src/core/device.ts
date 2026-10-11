/** Device tier: picks texture sizes, mesh density and effect quality (docs/plan/decisions.md D7). */
export type Tier = 'mobile' | 'desktop';

export function detectTier(): Tier {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'mobile' || forced === 'desktop') return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const lowMem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  return (coarse && small) || lowMem ? 'mobile' : 'desktop';
}

export const TIER_SETTINGS = {
  mobile: { maxPixelRatio: 2, faceSize: 512, globeSegments: 48, stars: 3000 },
  desktop: { maxPixelRatio: 2, faceSize: 1024, globeSegments: 96, stars: 6000 },
} as const;
