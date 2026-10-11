/**
 * Procedural soundtrack (Web Audio, no files). Off until the user turns it on (browsers require a
 * gesture). Levels are functions of simulation time, so scrubbing never "replays" sounds; the impact
 * boom fires only when playback crosses t = 0 at close to real-time speed.
 *
 * This is an interpretation, labelled as "chosen" in the UI: space is silent, and on the ground the
 * sounds of the impact would arrive minutes to hours apart depending on distance.
 */
export class Soundscape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private drone!: GainNode;
  private roar!: GainNode;
  private roarFilter!: BiquadFilterNode;
  private rumble!: GainNode;
  private lastT = Number.NaN;
  enabled = false;

  async enable(): Promise<void> {
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.3);
  }

  disable(): void {
    if (!this.ctx) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    // Brown-ish noise: integrated white noise, for a deeper rumble.
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = () => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start();
      return s;
    };

    // Drone: two detuned low sines.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    for (const f of [41, 41.7]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(this.drone);
      o.start();
    }
    this.drone.connect(this.master);

    // Roar: band-passed noise whose centre rises as the asteroid enters the atmosphere.
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'bandpass';
    this.roarFilter.Q.value = 0.8;
    src().connect(this.roarFilter).connect(this.roar).connect(this.master);

    // Rumble: low-passed noise for the aftermath.
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    src().connect(lp).connect(this.rumble).connect(this.master);
  }

  private boom(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(75, now);
    o.frequency.exponentialRampToValueAtTime(22, now + 4);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(1.2, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 9);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 9.5);
  }

  /** Call every frame with sim time and the current sim-seconds-per-second rate. */
  update(t: number, rate: number, playing: boolean): void {
    if (!this.ctx || !this.enabled) { this.lastT = t; return; }
    const now = this.ctx.currentTime;
    const live = playing && Math.abs(rate) < 3;
    if (live && this.lastT < 0 && t >= 0) this.boom();
    this.lastT = t;
    const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    // Drone swells over the final minute, then hands over to the rumble.
    const drone = smooth(-600, -10, t) * (1 - smooth(0, 30, t)) * 0.35;
    const roar = smooth(-8, -1, t) * (1 - smooth(0, 1.5, t)) * 0.9;
    const rumble = (t > 0 ? Math.exp(-t / 900) * 0.8 + 0.08 * Math.exp(-t / 86400) : 0) * smooth(0, 2, t);
    this.drone.gain.setTargetAtTime(playing ? drone : 0, now, 0.4);
    this.roar.gain.setTargetAtTime(playing ? roar : 0, now, 0.15);
    this.roarFilter.frequency.setTargetAtTime(200 + 1800 * smooth(-8, 0, t), now, 0.2);
    this.rumble.gain.setTargetAtTime(playing ? rumble : 0, now, 0.5);
  }
}
