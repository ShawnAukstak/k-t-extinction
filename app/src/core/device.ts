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
  mobile: {
    maxPixelRatio: 2, faceSize: 512, stars: 5000, plumeScale: 0.25, plumeSteps: 24,
    terrain: { segments: 24, maxLevel: 16, pixelError: 14, maxTiles: 600, buildsPerFrame: 3 },
    vegetation: { radiusCells: 1, spacing: 20, maxAltitude: 1500, buildsPerFrame: 1, coverCells: 1, coverPerCell: 60 },
    herds: { radiusCells: 1, maxAltitude: 4000, buildsPerFrame: 1, maxPerCell: 60 },
    shadows: { size: 1024, maxAltitude: 400 },
  },
  desktop: {
    maxPixelRatio: 2, faceSize: 1024, stars: 10000, plumeScale: 0.5, plumeSteps: 40,
    terrain: { segments: 32, maxLevel: 17, pixelError: 12, maxTiles: 1100, buildsPerFrame: 6 },
    vegetation: { radiusCells: 2, spacing: 17, maxAltitude: 2500, buildsPerFrame: 2, coverCells: 3, coverPerCell: 110 },
    herds: { radiusCells: 2, maxAltitude: 6000, buildsPerFrame: 1, maxPerCell: 120 },
    shadows: { size: 2048, maxAltitude: 700 },
  },
} as const;
