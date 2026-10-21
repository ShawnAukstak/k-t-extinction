/**
 * The scrubber: segmented non-linear bar, playhead, event markers, transport and speed controls,
 * and the time readout. Pure DOM; reads and writes the Clock.
 */
import { IMPACT } from '../config';
import type { Clock } from '../core/clock';
import { currentMarker, MARKERS, nextMarker, prevMarker, type TimelineEvent } from '../core/events';
import { barToTime, formatAge, formatRate, formatRelative, SEGMENTS, segmentIndexAt, segmentStart, timeToBar } from '../core/timeline';
import { SHARE_ICON } from './share';

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zM9.5 12 18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  resume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.7 9h2.1A5 5 0 1 0 12 7v3L7.5 6 12 2z"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class TimelineBar {
  readonly root: HTMLElement;
  /** Called when the user picks an event (marker click, prev/next). */
  onEvent: ((e: TimelineEvent) => void) | null = null;
  /** Called on any user interaction with the timeline. */
  onUserInput: (() => void) | null = null;
  /** The bar's own Share button (phones, where the top bar has no room for it). */
  onShare: (() => void) | null = null;
  /** "Back to the cinematic", offered after the user leaves it with "Free camera". */
  onResumeCinematic: (() => void) | null = null;
  /** Offered while the user has turned or zoomed the cinematic: back to its framing, or leave it. */
  onResetFollow: (() => void) | null = null;
  onFreeCamera: (() => void) | null = null;

  private readonly rel = el('div', 'kt-rel');
  private readonly age = el('span', 'kt-age');
  private readonly rate = el('span', 'kt-rate');
  private readonly caption = el('button', 'kt-caption');
  private readonly resume = el('button', 'kt-resume', `${ICONS.resume}<span>Back to the cinematic</span>`);
  private readonly followBar = el('div', 'kt-follow');
  private readonly playBtn = el('button', 'kt-btn kt-play', ICONS.play);
  private readonly track = el('div', 'kt-track');
  private readonly fill = el('div', 'kt-fill');
  private readonly playhead = el('div', 'kt-playhead');
  private readonly speedVal = el('span', 'kt-speed-val');
  private readonly segEls: HTMLElement[] = [];
  private scrubbing = false;
  private wasPlaying = false;
  private lastCaption = '';

  constructor(private readonly clock: Clock, parent: HTMLElement) {
    this.root = el('div', 'kt-hud');
    this.root.setAttribute('data-testid', 'timeline');

    const top = el('div', 'kt-top');
    const readout = el('div', 'kt-readout');
    const sub = el('div', 'kt-sub');
    sub.append(this.age, el('span', 'kt-dot', ' · '), this.rate);
    readout.append(this.rel, sub);
    this.caption.type = 'button';
    this.caption.setAttribute('aria-live', 'polite');
    this.resume.type = 'button';
    this.resume.hidden = true;
    this.resume.setAttribute('data-testid', 'resume-cinematic');
    this.resume.addEventListener('click', () => this.onResumeCinematic?.());
    const reset = el('button', '', `${ICONS.resume}<span>Reset<span class="kt-wide"> view</span></span>`);
    const free = el('button', '', '<span>Free camera</span>');
    reset.type = free.type = 'button';
    reset.setAttribute('data-testid', 'follow-reset');
    free.setAttribute('data-testid', 'free-camera');
    reset.title = 'Back to the cinematic framing';
    free.title = 'Leave the cinematic and move the camera anywhere';
    reset.addEventListener('click', () => this.onResetFollow?.());
    free.addEventListener('click', () => this.onFreeCamera?.());
    this.followBar.hidden = true;
    this.followBar.append(reset, free);
    const side = el('div', 'kt-top-side');
    side.append(this.resume, this.followBar, this.caption);
    top.append(readout, side);

    const bar = el('div', 'kt-bar');
    const transport = el('div', 'kt-transport');
    const prev = el('button', 'kt-btn', ICONS.prev);
    const next = el('button', 'kt-btn', ICONS.next);
    prev.setAttribute('aria-label', 'Previous event');
    next.setAttribute('aria-label', 'Next event');
    this.playBtn.setAttribute('aria-label', 'Play');
    for (const b of [prev, this.playBtn, next]) b.type = 'button';
    transport.append(prev, this.playBtn, next);

    // Track: segment bands with labels, the rail, markers and the playhead.
    this.track.setAttribute('role', 'slider');
    this.track.setAttribute('aria-label', 'Simulation time');
    this.track.tabIndex = 0;
    const segs = el('div', 'kt-segs');
    SEGMENTS.forEach((s, i) => {
      const band = el('div', 'kt-seg');
      band.style.left = `${segmentStart(i) * 100}%`;
      band.style.width = `${s.width * 100}%`;
      band.append(el('span', 'kt-seg-label', s.label));
      segs.append(band);
      this.segEls.push(band);
    });
    const rail = el('div', 'kt-rail');
    rail.append(this.fill);
    const markers = el('div', 'kt-markers');
    for (const m of MARKERS) {
      const b = el('button', `kt-marker kt-c-${m.confidence}`);
      b.type = 'button';
      b.style.left = `${timeToBar(m.t) * 100}%`;
      b.title = `${m.title} — ${formatRelative(m.t)}`;
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.jumpTo(m);
      });
      b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      markers.append(b);
    }
    this.track.append(segs, rail, markers, this.playhead);

    const speed = el('div', 'kt-speed');
    const slower = el('button', 'kt-btn kt-small', '−');
    const faster = el('button', 'kt-btn kt-small', '+');
    slower.type = faster.type = 'button';
    slower.setAttribute('aria-label', 'Slower');
    faster.setAttribute('aria-label', 'Faster');
    speed.append(slower, this.speedVal, faster);

    const share = el('button', 'kt-btn kt-share-mini', `${SHARE_ICON}<span>Share</span>`);
    share.type = 'button';
    share.setAttribute('aria-label', 'Share this moment');
    share.setAttribute('data-testid', 'share-mini');
    share.addEventListener('click', () => this.onShare?.());

    bar.append(transport, this.track, share, speed);
    this.root.append(top, bar);
    parent.append(this.root);

    // ── behaviour ──
    this.playBtn.addEventListener('click', () => { this.clock.toggle(); this.onUserInput?.(); });
    prev.addEventListener('click', () => { const e = prevMarker(this.clock.t); if (e) this.jumpTo(e); });
    next.addEventListener('click', () => { const e = nextMarker(this.clock.t); if (e) this.jumpTo(e); });
    slower.addEventListener('click', () => { this.clock.slower(); this.onUserInput?.(); });
    faster.addEventListener('click', () => { this.clock.faster(); this.onUserInput?.(); });
    this.caption.addEventListener('click', () => {
      const e = currentMarker(this.clock.t);
      if (e) this.onEvent?.(e);
    });

    this.track.addEventListener('pointerdown', this.onDown);
    this.track.addEventListener('pointermove', this.onMove);
    this.track.addEventListener('pointerup', this.onUp);
    this.track.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);

    this.update();
  }

  setResumeCinematic(on: boolean): void {
    if (this.resume.hidden === on) this.resume.hidden = !on;
  }

  setFollowControls(on: boolean): void {
    if (this.followBar.hidden === on) this.followBar.hidden = !on;
  }

  jumpTo(e: TimelineEvent): void {
    this.clock.seek(e.t);
    this.onEvent?.(e);
    this.onUserInput?.();
  }

  private fractionAt(clientX: number): number {
    const r = this.track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }

  private onDown = (e: PointerEvent): void => {
    this.track.setPointerCapture(e.pointerId);
    this.scrubbing = true;
    this.wasPlaying = this.clock.playing;
    this.clock.setPlaying(false);
    this.clock.seek(barToTime(this.fractionAt(e.clientX)));
    this.root.classList.add('kt-scrubbing');
    this.onUserInput?.();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.scrubbing) return;
    this.clock.seek(barToTime(this.fractionAt(e.clientX)));
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    if (this.track.hasPointerCapture(e.pointerId)) this.track.releasePointerCapture(e.pointerId);
    this.root.classList.remove('kt-scrubbing');
    if (this.wasPlaying) this.clock.setPlaying(true);
    this.onUserInput?.();
  };

  private onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    let handled = true;
    switch (e.key) {
      case ' ':
        this.clock.toggle();
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const u = timeToBar(this.clock.t) + dir * (e.shiftKey ? 0.02 : 0.004);
        this.clock.seek(barToTime(u));
        break;
      }
      case ']': { const ev = nextMarker(this.clock.t); if (ev) this.jumpTo(ev); break; }
      case '[': { const ev = prevMarker(this.clock.t); if (ev) this.jumpTo(ev); break; }
      case '+': case '=': this.clock.faster(); break;
      case '-': case '_': this.clock.slower(); break;
      default: handled = false;
    }
    if (handled) {
      e.preventDefault();
      this.onUserInput?.();
    }
  };

  /** Refresh the readout and playhead; cheap enough to call every frame. */
  update(): void {
    const t = this.clock.t;
    const u = timeToBar(t);
    this.playhead.style.left = `${u * 100}%`;
    this.fill.style.width = `${u * 100}%`;
    this.rel.textContent = formatRelative(t);
    this.age.textContent = formatAge(t, IMPACT.ageMa.value);
    this.rate.textContent = this.clock.playing ? formatRate(this.clock.rate()) : 'paused';
    this.speedVal.textContent = `×${this.clock.speed}`;
    this.track.setAttribute('aria-valuetext', `${formatRelative(t)}, ${formatAge(t, IMPACT.ageMa.value)}`);
    const playing = this.clock.playing;
    if (this.playBtn.dataset.state !== String(playing)) {
      this.playBtn.dataset.state = String(playing);
      this.playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
      this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    const si = segmentIndexAt(t);
    this.segEls.forEach((s, i) => s.classList.toggle('kt-current', i === si));
    const cur = currentMarker(t);
    const cap = cur ? cur.title : '';
    if (cap !== this.lastCaption) {
      this.lastCaption = cap;
      this.caption.textContent = cap;
      this.caption.hidden = !cap;
    }
  }

  /** The event caption on screen now ('' if none). */
  get captionText(): string {
    return this.lastCaption;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
