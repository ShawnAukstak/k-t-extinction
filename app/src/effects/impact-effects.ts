/**
 * Drives the impact effects on the globe: owns the effects lookup table and the time-dependent
 * uniforms shared with the globe shader (src/render/shaders/effects.ts).
 *
 * Row 0 of the table holds per-distance values from the Collins et al. 2005 scaling laws:
 *   R log10(ballistic ejecta arrival, s)   G log10(ejecta thickness, m)
 *   B log10(air-blast overpressure, bar)   A effective seismic magnitude
 * Rows 1…N hold the dust-cloud column (log10 kg/m²) at each keyframe time of dust.json.
 */
import { ClampToEdgeWrapping, Data3DTexture, DataTexture, DataUtils, HalfFloatType, LinearFilter, RepeatWrapping, RGFormat, RGBAFormat, UnsignedByteType, Vector3 } from 'three';
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

export type WinterScenario = 'soot' | 'so2' | 'dust';

/** How each darkening agent looks from space, and how hard it hits vegetation. */
export const WINTER_LOOK: Record<WinterScenario, { veil: [number, number, number]; severity: number; short: string; label: string }> = {
  soot: { veil: [0.02, 0.02, 0.02], severity: 1.0, short: 'Soot', label: 'Soot (from burning target rock organics)' },
  so2: { veil: [0.55, 0.55, 0.53], severity: 0.85, short: 'Sulfate haze', label: 'Sulfate haze (from vaporised anhydrite)' },
  dust: { veil: [0.24, 0.19, 0.13], severity: 0.6, short: 'Rock dust', label: 'Fine rock dust' },
};

const YEAR_S = 365.25 * 86400;

/** Observed crater dimensions (known), not the scaling-law estimate. */
export const CRATER_OBSERVED = { rimRadiusKm: 92, peakRingRadiusKm: 42, transientRadiusKm: 47 };

export class ImpactEffects {
  readonly crater: CraterResult;
  readonly table: DataTexture;
  readonly uniforms: Record<string, { value: unknown }>;
  private dustTimes: number[] = [];
  private dustLog: number[][] = [];
  private tsunamiRaw: { data: Uint16Array; width: number; height: number; unit: number } | null = null;
  private winterRaw: { data: Uint8Array; width: number; height: number; layers: number } | null = null;
  private winterTimes: number[] = [];
  private winterMeanLight: number[] = [];
  scenario: WinterScenario = 'soot';
  /** Global mean sunlight fraction right now (for the sky and the HUD). */
  meanLight = 1;
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
      uWinter: { value: new Data3DTexture(new Uint8Array([255, 0]), 1, 1, 1) },
      uWinterLayer: { value: 0 },
      uWinterLayers: { value: 1 },
      uWinterOn: { value: 0 },
      uVeil: { value: new Vector3(...WINTER_LOOK.soot.veil) },
      uLife: { value: new Vector3(0, 0, 0) },   // x die-off, y fern cover, z forest recovery
      uPick: { value: [0, 0, 0, 0] },
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
      this.dustLog = d.log10Column.slice(0, n);
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
      this.tsunamiRaw = { data: raw, width: meta.width, height: meta.height, unit: meta.timeUnitS };
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

  /** Impact-winter fields from Tabor et al. 2020 (scripts/process_effects.py). */
  async loadWinter(baseUrl: string, scenario: WinterScenario): Promise<boolean> {
    try {
      const meta = await (await fetch(`${baseUrl}/winter_${scenario}.json`)).json() as { width: number; height: number; layers: number; times: number[] };
      const res = await fetch(`${baseUrl}/winter_${scenario}.bin`);
      if (!res.ok) return false;
      const data = new Uint8Array(await res.arrayBuffer());
      if (data.length !== meta.width * meta.height * meta.layers * 2) throw new Error('winter file size mismatch');
      const tex = new Data3DTexture(data, meta.width, meta.height, meta.layers);
      tex.format = RGFormat;
      tex.type = UnsignedByteType;
      tex.minFilter = tex.magFilter = LinearFilter;
      tex.wrapS = RepeatWrapping;
      tex.wrapT = tex.wrapR = ClampToEdgeWrapping;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      (this.uniforms.uWinter.value as Data3DTexture).dispose();
      this.uniforms.uWinter.value = tex;
      this.uniforms.uWinterLayers.value = meta.layers;
      this.uniforms.uWinterOn.value = 1;
      (this.uniforms.uVeil.value as Vector3).set(...WINTER_LOOK[scenario].veil);
      this.winterTimes = meta.times;
      this.winterRaw = { data, width: meta.width, height: meta.height, layers: meta.layers };
      // Area-weighted global mean light per layer, for the sky.
      const { width: w, height: h } = meta;
      this.winterMeanLight = [];
      for (let l = 0; l < meta.layers; l++) {
        let sum = 0, wsum = 0;
        for (let j = 0; j < h; j++) {
          const wt = Math.cos(((-90 + (180 * j) / (h - 1)) * Math.PI) / 180);
          for (let i = 0; i < w; i++) { sum += wt * data[((l * h + j) * w + i) * 2] / 255; wsum += wt; }
        }
        this.winterMeanLight.push(sum / wsum);
      }
      this.scenario = scenario;
      return true;
    } catch (e) {
      console.warn('impact winter data unavailable', e);
      return false;
    }
  }

  // ── CPU-side queries for "what happened here?" ────────────────────────────

  tsunamiAt(lat: number, lon: number): { arrivalS: number; heightM: number } | null {
    const r = this.tsunamiRaw;
    if (!r) return null;
    const i = Math.min(r.height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * r.height)));
    const j = Math.floor(((((lon + 180) % 360) + 360) % 360) / 360 * r.width) % r.width;
    const k = i * r.width + j;
    const n = r.width * r.height;
    return { arrivalS: r.data[k] * r.unit, heightM: 10 ** (r.data[n + k] / 1000 - 2) };
  }

  /** First keyframe time at which the cloud column at this angular distance exceeds 1 kg/m². */
  dustArrivalAt(angleRad: number): number | null {
    if (this.dustTimes.length === 0) return null;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((angleRad / Math.PI) * BINS)));
    for (let r = 0; r < this.dustTimes.length; r++) {
      if (this.dustLog[r][b] >= 0) {
        if (r === 0) return this.dustTimes[0];
        // Interpolate in log time between the keyframe before and this one.
        const a = this.dustLog[r - 1][b], c = this.dustLog[r][b];
        const f = (0 - a) / Math.max(1e-6, c - a);
        const t0 = Math.max(1, this.dustTimes[r - 1]), t1 = this.dustTimes[r];
        return t0 * (t1 / t0) ** Math.min(1, Math.max(0, f));
      }
    }
    return null;
  }

  winterAt(lat: number, lon: number): { times: number[]; light: number[]; tempC: number[] } | null {
    const r = this.winterRaw;
    if (!r) return null;
    const j = Math.round((((lon % 360) + 360) % 360) / 2.5) % r.width;
    const i = Math.min(r.height - 1, Math.max(0, Math.round(((lat + 90) / 180) * (r.height - 1))));
    const light: number[] = [], tempC: number[] = [];
    for (let l = 0; l < r.layers; l++) {
      const k = ((l * r.height + i) * r.width + j) * 2;
      light.push(r.data[k] / 255);
      tempC.push(r.data[k + 1] / 2.55 - 60);
    }
    return { times: this.winterTimes, light, tempC };
  }

  update(t: number): void {
    this.uniforms.uT.value = t;
    // Impact winter layer (fractional, between keyframe months) and global light.
    const wt = this.winterTimes;
    if (wt.length > 1) {
      let layer: number;
      if (t <= 0) layer = 0;
      else if (t >= wt[wt.length - 1]) {
        // Beyond the 20-year run the climate has recovered: fade back to the first (pre-impact) layer.
        layer = wt.length - 1;
      } else {
        let i = 0;
        while (wt[i + 1] < t) i++;
        layer = i + (t - wt[i]) / (wt[i + 1] - wt[i]);
      }
      this.uniforms.uWinterLayer.value = layer;
      const i0 = Math.floor(layer), f = layer - i0;
      const ml = this.winterMeanLight;
      this.meanLight = ml[i0] * (1 - f) + (ml[Math.min(i0 + 1, ml.length - 1)] ?? 1) * f;
      if (t > wt[wt.length - 1]) this.meanLight = 1;
    }
    // Plants: die back over months of darkness and cold, ferns colonise first, forests take millennia
    // (fern spike: Vajda 2001; recovery: Lyson 2019). Smooth curves through those milestones.
    const sev = WINTER_LOOK[this.scenario].severity;
    const yr = t / YEAR_S;
    const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const life = this.uniforms.uLife.value as Vector3;
    life.set(sev * ss(7 / 365, 0.5, yr), ss(3, 30, yr), ss(1_000, 100_000, yr));

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
