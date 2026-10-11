/**
 * Scenario constants. Every number here is shown somewhere in the UI, so each carries the
 * confidence label used by the info tooltips (see docs/plan/decisions.md, "Factual-accuracy UX").
 * Sources and ranges live in docs/research/; change them there first.
 */

export type Confidence = 'known' | 'model' | 'contested' | 'chosen';

export interface Fact<T> {
  value: T;
  confidence: Confidence;
  note: string;
  sources?: string[];
}

/** Mean Earth radius, metres. The paleo-globe uses a sphere (the DEM is on a sphere too). */
export const EARTH_RADIUS = 6_371_000;

/** Top of the rendered atmosphere, metres above the surface. */
export const ATMOSPHERE_HEIGHT = 100_000;

export const IMPACT = {
  /**
   * Crater centre in the PALEOMAP frame at 65 Ma (the age of the terrain slice), from GPlates Web
   * Service `reconstruct_points?points=-89.53,21.29&time=65&model=PALEOMAP` (2026-10-11).
   * Modern position 21.29°N 89.53°W (Collins et al. 2020).
   */
  site: {
    value: { lat: 25.1149, lon: -71.5823 },
    confidence: 'model',
    note: 'Crater centre rotated back to 65 Ma with the PALEOMAP plate model. Other plate models place it a few degrees away.',
    sources: ['collins2020', 'paleodem'],
  } satisfies Fact<{ lat: number; lon: number }>,

  diameterM: {
    value: 13_000,
    confidence: 'model',
    note: 'About 12–14 km for a ~20 km/s impact; estimates range 10–17 km depending on assumed speed.',
    sources: ['collins2020', 'schulte2010'],
  } satisfies Fact<number>,

  speedMs: {
    value: 20_000,
    confidence: 'model',
    note: 'Not measurable from the rocks. 20 km/s is close to the mean asteroid impact speed; 12–20 km/s modelled.',
    sources: ['collins2020'],
  } satisfies Fact<number>,

  /** Degrees above the horizon. */
  angleDeg: {
    value: 60,
    confidence: 'model',
    note: 'A steep 45–60° impact best explains the crater’s 3-D structure; shallow (< 30°) impacts are ruled out.',
    sources: ['collins2020'],
  } satisfies Fact<number>,

  /** Direction of travel, degrees clockwise from north. It came from the NE heading SW. */
  headingDeg: {
    value: 225,
    confidence: 'model',
    note: 'Approached from the northeast, travelling southwest (from offsets between the crater, peak ring and mantle uplift).',
    sources: ['collins2020'],
  } satisfies Fact<number>,

  densityKgM3: {
    value: 2630,
    confidence: 'contested',
    note: 'Carbonaceous (C-type) asteroid; bulk porosity unknown. 2630 kg/m³ follows Collins et al. 2020.',
    sources: ['collins2020', 'fischergodde2024'],
  } satisfies Fact<number>,

  ageMa: {
    value: 66.04,
    confidence: 'known',
    note: '66.04 ± 0.05 million years ago (argon–argon and uranium–lead dating agree within error).',
    sources: ['renne2013', 'clyde2016'],
  } satisfies Fact<number>,
} as const;

export const SKY = {
  /** Local solar time at the impact site at T = 0, hours. */
  localSolarTimeH: {
    value: 10,
    confidence: 'chosen',
    note: 'No evidence records the hour. We chose mid-morning so the impact site is in daylight and the far side of the planet, where ejecta re-entry concentrates, is in darkness.',
  } satisfies Fact<number>,

  /** Solar declination at T = 0, degrees (boreal spring). */
  declinationDeg: {
    value: 10,
    confidence: 'chosen',
    note: 'Fish killed at Tanis record boreal spring (During et al. 2022). The exact day is unknown; we use a sun declination of +10° (≈ late April).',
    sources: ['during2022'],
  } satisfies Fact<number>,

  /** Earth's obliquity, degrees. Close to today's 23.4° (it oscillates 22.1–24.5° over 41 kyr). */
  obliquityDeg: {
    value: 23.4,
    confidence: 'model',
    note: 'Axial tilt oscillates between about 22° and 24.5°; we use today’s mean.',
  } satisfies Fact<number>,

  /** Length of the solar day at 66 Ma, hours. */
  dayLengthH: {
    value: 23.5,
    confidence: 'model',
    note: 'Tidal braking has slowed Earth’s spin since. Daily growth bands in a ~70-million-year-old rudist clam record ~372 days per year, a day of about 23.5 hours (de Winter et al. 2020).',
    sources: ['dewinter2020'],
  } satisfies Fact<number>,
} as const;

/** Seconds in one (sidereal-ish) year; the year length in seconds hasn't changed appreciably. */
export const YEAR_S = 365.25 * 86_400;
