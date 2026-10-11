/**
 * Drives the impact effects on the globe: owns the effects lookup table and the time-dependent
 * uniforms shared with the globe shader (src/render/shaders/effects.ts).
 *
 * Row 0 of the table holds per-distance values from the Collins et al. 2005 scaling laws:
 *   R log10(ballistic ejecta arrival, s)   G log10(ejecta thickness, m)
 *   B log10(air-blast overpressure, bar)   A effective seismic magnitude
 * Rows 1…N hold the dust-cloud column (log10 kg/m²) at each keyframe time of dust.json.
 */
import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, RepeatWrapping, RGFormat, RGBAFormat, Vector3 } from 'three';
import { IMPACT } from '../config';
import { DEG, enuBasis, latLonToVec } from '../core/geo';
import { atDistance, crater, type CraterResult } from '../physics/eiep';

const BINS = 256;
const MAX_DUST_ROWS = 31;

interface DustFile {
  bins: number;
  times: number[];
  log10Column: number[][];
}

/** Observed crater dimensions (known), not the scaling-law estimate. */
export const CRATER_OBSERVED = { rimRadiusKm: 92, peakRingRadiusKm: 42, transientRadiusKm: 47 };

export class ImpactEffects {
  readonly crater: CraterResult;
  readonly table: DataTexture;
  readonly uniforms: Record<string, { value: unknown }>;
  private dustTimes: number[] = [];
  private readonly data: Uint16Array;

  constructor() {
    const p = IMPACT;
    this.crater = crater({
      diameterM: p.diameterM.value,
      densityKgM3: p.densityKgM3.value,
      speedMs: p.speedMs.value,
      angleDeg: p.angleDeg.value,
      targetDensityKgM3: 2500,
    });
    const rows = 1 + MAX_DUST_ROWS;
    this.data = new Uint16Array(BINS * rows * 4);
    for (let i = 0; i < BINS; i++) {
      const ang = ((i + 0.5) / BINS) * Math.PI;
      const rKm = Math.max(1, ang * 6371);
      const a = atDistance(this.crater, rKm);
      this.set(0, i, [
        Math.log10(Math.max(1e-3, a.ejectaArrivalS)),
        Math.log10(Math.max(1e-9, a.ejectaThicknessM)),
        Math.log10(Math.max(1e-9, a.overpressureBar)),
        a.seismicMagnitude,
      ]);
    }
    this.table = new DataTexture(this.data, BINS, rows, RGBAFormat, HalfFloatType);
    this.table.minFilter = this.table.magFilter = LinearFilter;
    this.table.wrapS = this.table.wrapT = ClampToEdgeWrapping;
    this.table.needsUpdate = true;

    const site = p.site.value;
    const { e, n } = enuBasis(site.lat, site.lon);
    this.uniforms = {
      uFxTable: { value: this.table },
      uFxRows: { value: rows },
      uImpactDir: { value: latLonToVec(site.lat, site.lon, 1) },
      uImpactEast: { value: e },
      uImpactNorth: { value: n },
      uT: { value: 0 },
      uDust: { value: new Vector3(1, 1, 0) },
      uDustOn: { value: 0 },
      uCrater: {
        value: [CRATER_OBSERVED.rimRadiusKm, CRATER_OBSERVED.peakRingRadiusKm, CRATER_OBSERVED.transientRadiusKm, this.crater.fireballRadiusKm],
      },
      // The resurge enters from the deep (north-east) side of the shelf; 57.6° in the 65 Ma frame.
      uDeepAzimuth: { value: 57.6 * DEG },
      uOverlay: { value: 0 },
      uTsunami: { value: new DataTexture(new Uint16Array([0, 0]), 1, 1, RGFormat, HalfFloatType) },
      uTsunamiOn: { value: 0 },
    };
  }

  private set(row: number, col: number, v: number[]): void {
    const k = (row * BINS + col) * 4;
    for (let c = 0; c < 4; c++) this.data[k + c] = DataUtils.toHalfFloat(v[c] ?? 0);
  }

  async loadDust(url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const d = (await res.json()) as DustFile;
      if (d.bins !== BINS) throw new Error(`dust.json has ${d.bins} bins, expected ${BINS}`);
      const n = Math.min(MAX_DUST_ROWS, d.times.length);
      for (let r = 0; r < n; r++) for (let i = 0; i < BINS; i++) this.set(1 + r, i, [d.log10Column[r][i], 0, 0, 0]);
      this.dustTimes = d.times.slice(0, n);
      this.table.needsUpdate = true;
      this.uniforms.uDustOn.value = 1;
      return true;
    } catch (e) {
      console.warn('dust profiles unavailable', e);
      return false;
    }
  }

  /**
   * Tsunami arrival time (hours) and log10 maximum height (m) on a 0.25° equirectangular grid,
   * from scripts/process_tsunami.py (travel times on our bathymetry; heights from Range et al. 2022).
   */
  async loadTsunami(baseUrl: string): Promise<boolean> {
    try {
      const meta = await (await fetch(`${baseUrl}/tsunami.json`)).json() as { width: number; height: number; timeUnitS: number };
      const res = await fetch(`${baseUrl}/tsunami.bin`);
      if (!res.ok) return false;
      const raw = new Uint16Array(await res.arrayBuffer());
      const n = meta.width * meta.height;
      if (raw.length !== 2 * n) throw new Error('tsunami.bin size mismatch');
      const px = new Uint16Array(2 * n);
      for (let i = 0; i < n; i++) {
        px[2 * i] = DataUtils.toHalfFloat((raw[i] * meta.timeUnitS) / 3600);
        px[2 * i + 1] = DataUtils.toHalfFloat(raw[n + i] / 1000 - 2);
      }
      const tex = new DataTexture(px, meta.width, meta.height, RGFormat, HalfFloatType);
      tex.minFilter = tex.magFilter = LinearFilter;
      tex.wrapS = RepeatWrapping;
      tex.wrapT = ClampToEdgeWrapping;
      tex.needsUpdate = true;
      (this.uniforms.uTsunami.value as DataTexture).dispose();
      this.uniforms.uTsunami.value = tex;
      this.uniforms.uTsunamiOn.value = 1;
      return true;
    } catch (e) {
      console.warn('tsunami data unavailable', e);
      return false;
    }
  }

  update(t: number): void {
    this.uniforms.uT.value = t;
    const times = this.dustTimes;
    if (times.length === 0) return;
    const dust = this.uniforms.uDust.value as Vector3;
    if (t <= times[0]) dust.set(1, 1, 0);
    else if (t >= times[times.length - 1]) dust.set(times.length, times.length, 0);
    else {
      let i = 0;
      while (times[i + 1] < t) i++;
      // Interpolate in log time: the cloud evolves roughly self-similarly.
      const w = Math.log(t / Math.max(1, times[i])) / Math.log(times[i + 1] / Math.max(1, times[i]));
      dust.set(1 + i, 2 + i, Math.min(1, Math.max(0, times[i] === 0 ? t / times[1] : w)));
    }
  }
}
