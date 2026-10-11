/**
 * Earth Impact Effects Program scaling laws (Collins, Melosh & Marcus 2005, MAPS 40:817).
 * Port of scripts/eiep_reference.py (the tested oracle). Equation numbers refer to the paper.
 * SI units unless a name says otherwise.
 *
 * These are order-of-magnitude scaling laws, extrapolated well beyond their calibration at Chicxulub
 * scale (the paper notes air blast may be overestimated 2–5×). The app labels them "model".
 */
const G = 9.81;
const RE = 6.371e6;
const SIGMA = 5.67e-8;
const T_STAR = 3000;   // fireball transparency temperature, K
const ETA = 3e-3;      // luminous efficiency
const P0 = 1e5;        // ambient pressure, Pa
const C0 = 330;        // speed of sound, m/s
const MT = 4.18e15;    // J per megaton TNT
const KT = 4.18e12;
const D_C = 3.2;       // simple→complex crater transition on Earth, km

export interface ImpactParams {
  diameterM: number;
  densityKgM3: number;
  speedMs: number;
  angleDeg: number;
  targetDensityKgM3: number;
}

export interface CraterResult {
  energyJ: number;
  energyMt: number;
  transientDiameterKm: number;
  transientDepthKm: number;
  finalDiameterKm: number;
  finalDepthKm: number;
  meltVolumeKm3: number;
  fireballRadiusKm: number;
  timeToMaxRadiationS: number;
  thermalDurationS: number;
  magnitude: number;
}

export interface LocalEffects {
  distanceKm: number;
  /** Thermal exposure from the fireball, MJ/m² (0 below the horizon). */
  thermalMJm2: number;
  fireballVisible: boolean;
  /** Effective seismic magnitude felt at this distance. */
  seismicMagnitude: number;
  seismicArrivalS: number;
  ejectaThicknessM: number;
  ejectaArrivalS: number;
  overpressureBar: number;
  windMs: number;
  blastArrivalS: number;
}

export function crater(p: ImpactParams): CraterResult {
  const th = (p.angleDeg * Math.PI) / 180;
  const L = p.diameterM, v = p.speedMs;
  const E = (Math.PI / 12) * p.densityKgM3 * L ** 3 * v ** 2; // eq 1
  const Dtc = 1.161 * (p.densityKgM3 / p.targetDensityKgM3) ** (1 / 3) * L ** 0.78 * v ** 0.44 * G ** -0.22 * Math.sin(th) ** (1 / 3); // eq 21
  const dtc = Dtc / (2 * Math.SQRT2); // eq 25
  const DtcKm = Dtc / 1e3;
  let DfrKm: number, dfrKm: number;
  if (DtcKm > 2.56) {
    DfrKm = (1.17 * DtcKm ** 1.13) / D_C ** 0.13; // eq 27
    dfrKm = 0.4 * DfrKm ** 0.3;                    // eq 28
  } else {
    DfrKm = 1.25 * DtcKm;
    dfrKm = NaN;
  }
  const Vm = 8.9e-12 * E * Math.sin(th); // eq 30
  const Rf = 0.002 * E ** (1 / 3);       // eq 32
  return {
    energyJ: E,
    energyMt: E / MT,
    transientDiameterKm: DtcKm,
    transientDepthKm: dtc / 1e3,
    finalDiameterKm: DfrKm,
    finalDepthKm: dfrKm,
    meltVolumeKm3: Vm / 1e9,
    fireballRadiusKm: Rf / 1e3,
    timeToMaxRadiationS: Rf / v,                                        // eq 33
    thermalDurationS: (ETA * E) / (2 * Math.PI * Rf ** 2 * SIGMA * T_STAR ** 4), // eq 35
    magnitude: 0.67 * Math.log10(E) - 5.87,                             // eq 40
  };
}

/** Ballistic flight time to a range (eqs 49–52); also used for the ejecta front on the globe. */
export function ejectaFlightTime(distanceKm: number): { seconds: number; launchSpeedMs: number } {
  const Delta = (distanceKm * 1e3) / RE;
  const t2 = Math.tan(Delta / 2);
  const ve2 = (2 * G * RE * t2) / (1 + t2);              // eq 52
  const e2 = 0.5 * ((ve2 / (G * RE) - 1) ** 2 + 1);       // eq 50
  let e = Math.sqrt(e2);
  if (ve2 / (G * RE) <= 1) e = -e;
  const a = ve2 / (2 * G * (1 - e2));                     // eq 51
  const Te = ((2 * a ** 1.5) / Math.sqrt(G * RE ** 2)) * (
    2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(Delta / 4))
    - (e * Math.sqrt(1 - e2) * Math.sin(Delta / 2)) / (1 + e * Math.cos(Delta / 2))); // eq 49
  return { seconds: Te, launchSpeedMs: Math.sqrt(ve2) };
}

export function atDistance(c: CraterResult, distanceKm: number): LocalEffects {
  const r = distanceKm * 1e3;
  const E = c.energyJ;
  const Delta = r / RE;
  // thermal (eqs 34, 36, 37)
  const Rf = c.fireballRadiusKm * 1e3;
  const h = (1 - Math.cos(Delta)) * RE;
  let f = 0;
  if (h < Rf) {
    const delta = Math.acos(h / Rf);
    f = (2 / Math.PI) * (delta - (h / Rf) * Math.sin(delta));
  }
  const Phi = ((ETA * E) / (2 * Math.PI * r * r)) * f;
  // seismic (eqs 41a–c; 41c uses 3.399, see scripts/eiep_reference.py)
  let Meff: number;
  if (distanceKm < 60) Meff = c.magnitude - 0.0238 * distanceKm;
  else if (distanceKm < 700) Meff = c.magnitude - 0.0048 * distanceKm - 1.1644;
  else Meff = c.magnitude - 1.66 * Math.log10((Delta * 180) / Math.PI) - 3.399;
  // ejecta (eq 47) and flight time
  const Dtc = c.transientDiameterKm * 1e3;
  const ej = ejectaFlightTime(distanceKm);
  // air blast (eqs 54, 57, 59, 64)
  const r1 = r / (E / KT) ** (1 / 3);
  const px = 75_000, rx = 290;
  const p = ((px * rx) / (4 * r1)) * (1 + 3 * (rx / r1) ** 1.3);
  return {
    distanceKm,
    thermalMJm2: Phi / 1e6,
    fireballVisible: f > 0,
    seismicMagnitude: Meff,
    seismicArrivalS: distanceKm / 5,
    ejectaThicknessM: Dtc ** 4 / (112 * r ** 3),
    ejectaArrivalS: ej.seconds,
    overpressureBar: p / 1e5,
    windMs: (((5 * p) / (7 * P0)) * C0) / Math.sqrt(1 + (6 * p) / (7 * P0)),
    blastArrivalS: r / C0,
  };
}
