/** Playback state: the single source of truth for simulation time. */
import { advance, clampTime, rateAt, T_END } from './timeline';

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

export class Clock {
  t: number;
  playing: boolean;
  speed: number;
  private listeners = new Set<() => void>();

  constructor(t = 0, playing = true, speed = 1) {
    this.t = clampTime(t);
    this.playing = playing;
    this.speed = speed;
  }

  /** Advance by wall-clock dt. Stops at the end of the timeline. */
  tick(dt: number): void {
    if (!this.playing || dt <= 0) return;
    this.t = advance(this.t, dt, this.speed);
    if (this.t >= T_END) this.playing = false;
    this.emit();
  }

  seek(t: number): void {
    this.t = clampTime(t);
    this.emit();
  }

  setPlaying(p: boolean): void {
    if (p && this.t >= T_END) return;
    this.playing = p;
    this.emit();
  }

  toggle(): void {
    this.setPlaying(!this.playing);
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.emit();
  }

  faster(): void {
    const i = SPEEDS.findIndex((s) => s >= this.speed);
    this.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + 1)]);
  }

  slower(): void {
    const i = SPEEDS.findIndex((s) => s >= this.speed);
    this.setSpeed(SPEEDS[Math.max(0, (i < 0 ? SPEEDS.length - 1 : i) - 1)]);
  }

  /** Sim seconds per wall second right now. */
  rate(): number {
    return rateAt(this.t) * this.speed;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
