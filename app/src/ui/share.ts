/**
 * Share this moment: a link that reopens the app at the same time, camera and panel, with a preview of
 * the frame. Opening the sheet freezes the moment (playback pauses until it closes), so the link, the
 * picture and the screen all show the same thing.
 */

export interface ShareMoment {
  /** "T+1 h 00 min" */
  when: string;
  /** "66,040,000 years ago" */
  age: string;
  /** The event on screen, if any ("Tsunami leaves the Gulf"). */
  caption: string;
  /** The rendered frame (canvas only, no controls). */
  frame: HTMLCanvasElement;
  /** True when the camera is the scripted one (the link then follows the script, not a fixed pose). */
  cinematic: boolean;
  /** The link, opening paused at this moment or playing on from it. */
  link: (playing: boolean) => string;
}

const TITLE = 'K–T Extinction Simulator';
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l4.5 4.5-1.4 1.4L13 6.8V15h-2V6.8L8.9 8.9 7.5 7.5zM5 13h2v6h10v-6h2v8H5z"/></svg>';
export { SHARE_ICON };

/** The frame with a caption along the bottom, for the preview and the saved image. */
export function captionedImage(m: Pick<ShareMoment, 'when' | 'age' | 'caption' | 'frame'>, maxWidth = 1600): HTMLCanvasElement {
  const src = m.frame;
  const s = Math.min(1, maxWidth / src.width);
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) return c;
  g.drawImage(src, 0, 0, w, h);
  // Type scales with the image; portrait (phone) frames get relatively larger type.
  const u = Math.max(12, Math.round(h > w ? w / 30 : Math.min(w, h * 1.6) / 46));
  const grad = g.createLinearGradient(0, h - u * 8, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.72)');
  g.fillStyle = grad;
  g.fillRect(0, h - u * 8, w, u * 8);
  const pad = Math.round(u * 1.1);
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = u * 0.4;
  g.fillStyle = '#fff';
  g.font = `700 ${Math.round(u * 1.6)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  g.fillText(m.when, pad, h - pad - u * 1.5);
  g.font = `600 ${u}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.fillStyle = 'rgba(233,236,241,0.9)';
  const line = [m.caption, m.age].filter(Boolean).join(' · ');
  g.fillText(line, pad, h - pad);
  // The title sits bottom-right, or above the time where the line below would run into it.
  g.fillStyle = 'rgba(233,236,241,0.75)';
  if (g.measureText(line).width + g.measureText(TITLE).width + pad * 3 < w) {
    g.textAlign = 'right';
    g.fillText(TITLE, w - pad, h - pad);
  } else {
    g.fillText(TITLE, pad, h - pad - u * 3.5);
  }
  return c;
}

function fileStamp(when: string): string {
  return when.replace(/[−]/g, '-').replace(/[^0-9A-Za-z+\-.]+/g, '').slice(0, 24);
}

export class ShareSheet {
  readonly root: HTMLElement;
  onClose: (() => void) | null = null;
  private readonly sheet: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly what: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly nativeBtn: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly modes: HTMLButtonElement[];
  private moment: ShareMoment | null = null;
  private image: HTMLCanvasElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private copiedTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'kt-share-backdrop';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="kt-share" role="dialog" aria-modal="true" aria-labelledby="kt-share-title" data-testid="share-sheet">
        <button type="button" class="kt-panel-close" aria-label="Close">×</button>
        <div class="kt-kicker">Share</div>
        <h2 id="kt-share-title">This moment</h2>
        <figure class="kt-share-shot"><img alt="" /></figure>
        <p class="kt-share-what"></p>
        <div class="kt-share-modes" role="radiogroup" aria-label="When the link opens">
          <button type="button" role="radio" data-play="0">Paused here</button>
          <button type="button" role="radio" data-play="1">Playing from here</button>
        </div>
        <div class="kt-share-link">
          <input type="text" readonly aria-label="Link to this moment" data-testid="share-url" spellcheck="false" />
          <button type="button" class="kt-share-copy" data-testid="share-copy">Copy link</button>
        </div>
        <div class="kt-btn-row">
          <button type="button" data-act="native" hidden>Share via…</button>
          <button type="button" data-act="image" data-testid="share-image">Save image</button>
        </div>
        <div class="kt-share-status" role="status" aria-live="polite"></div>
      </div>`;
    parent.append(this.root);
    this.sheet = this.root.querySelector('.kt-share')!;
    this.img = this.root.querySelector('img')!;
    this.what = this.root.querySelector('.kt-share-what')!;
    this.input = this.root.querySelector('input')!;
    this.copyBtn = this.root.querySelector('.kt-share-copy')!;
    this.nativeBtn = this.root.querySelector('[data-act="native"]')!;
    this.status = this.root.querySelector('.kt-share-status')!;
    this.modes = [...this.root.querySelectorAll<HTMLButtonElement>('[data-play]')];
    this.nativeBtn.hidden = typeof navigator.share !== 'function';

    this.root.querySelector('.kt-panel-close')!.addEventListener('click', () => this.close());
    // A click on the dimmed backdrop (not the sheet) closes.
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    for (const b of this.modes) b.addEventListener('click', () => this.setPlaying(b.dataset.play === '1'));
    this.input.addEventListener('focus', () => this.input.select());
    this.copyBtn.addEventListener('click', () => void this.copy());
    this.nativeBtn.addEventListener('click', () => void this.native());
    this.root.querySelector('[data-act="image"]')!.addEventListener('click', () => this.saveImage());
  }

  /**
   * While open, keys belong to the sheet wherever focus is (Safari doesn't focus buttons on click):
   * Escape closes, Tab stays inside, and nothing reaches the app's shortcuts (space would play).
   */
  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    else if (e.key === 'Tab') this.trapFocus(e);
    else if (e.key === ' ' && !this.sheet.contains(e.target as Node)) e.preventDefault();
  };

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(m: ShareMoment): void {
    this.moment = m;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.image = captionedImage(m);
    this.img.src = this.image.toDataURL('image/jpeg', 0.82);
    this.img.alt = `The view at ${m.when}${m.caption ? `: ${m.caption}` : ''}`;
    this.status.textContent = '';
    this.copyBtn.textContent = 'Copy link';
    this.setPlaying(false);
    this.root.hidden = false;
    window.addEventListener('keydown', this.onKey, true);
    this.copyBtn.focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey, true);
    window.clearTimeout(this.copiedTimer);
    this.moment = null;
    this.image = null;
    this.returnFocus?.focus();
    this.onClose?.();
  }

  private setPlaying(p: boolean): void {
    for (const b of this.modes) b.setAttribute('aria-checked', String((b.dataset.play === '1') === p));
    if (!this.moment) return;
    const m = this.moment;
    const camera = m.cinematic ? 'the cinematic camera' : 'this camera angle';
    this.what.innerHTML = '';
    this.what.append(
      'Opens at ', bold(m.when), `, from ${camera}, `,
      p ? 'and plays on from there.' : 'paused on this frame.',
    );
    this.input.value = m.link(p);
  }

  private async copy(): Promise<void> {
    const url = this.input.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Older browsers, or no clipboard permission: copy the selected text instead.
      this.input.focus();
      this.input.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
    }
    this.copyBtn.textContent = ok ? 'Copied ✓' : 'Copy link';
    this.status.textContent = ok ? 'Link copied.' : 'Select the link and copy it.';
    if (!ok) { this.input.focus(); this.input.select(); }
    window.clearTimeout(this.copiedTimer);
    this.copiedTimer = window.setTimeout(() => { this.copyBtn.textContent = 'Copy link'; }, 2500);
  }

  private async native(): Promise<void> {
    const m = this.moment;
    if (!m) return;
    const text = `The Chicxulub impact, ${m.when}${m.caption ? ` — ${m.caption}` : ''}`;
    try {
      await navigator.share({ title: TITLE, text, url: this.input.value });
    } catch {
      // Dismissed by the user, or not allowed: nothing to do.
    }
  }

  private saveImage(): void {
    const m = this.moment, img = this.image;
    if (!m || !img) return;
    img.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kt-extinction-${fileStamp(m.when)}.jpg`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      this.status.textContent = 'Image saved.';
    }, 'image/jpeg', 0.9);
  }

  private trapFocus(e: KeyboardEvent): void {
    const items = [...this.sheet.querySelectorAll<HTMLElement>('button, input')].filter((x) => !x.hidden && x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const inside = this.sheet.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
  }
}

function bold(s: string): HTMLElement {
  const b = document.createElement('b');
  b.textContent = s;
  return b;
}
