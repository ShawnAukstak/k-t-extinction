/**
 * The info card: event details with sources, and "what happened here?" for a tapped location.
 * Every number carries its confidence (known / model / contested / chosen) and links its sources.
 */
import type { Confidence } from '../config';
import type { TimelineEvent } from '../core/events';
import type { LocalHistory } from '../core/local-history';
import type { Poi } from '../core/pois';
import { SOURCES } from '../core/sources';
import { formatRelative } from '../core/timeline';

const CONFIDENCE_TEXT: Record<Confidence, { label: string; title: string }> = {
  known: { label: 'Known', title: 'Well constrained: independent evidence agrees.' },
  model: { label: 'Model', title: 'From models or scaling laws that broadly agree; shown with their range.' },
  contested: { label: 'Contested', title: 'Scientists disagree; we show one published estimate and note the others.' },
  chosen: { label: 'Chosen', title: 'Not known. We picked a value and say why.' },
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function chip(c: Confidence): string {
  const t = CONFIDENCE_TEXT[c];
  return `<span class="kt-chip kt-chip-${c}" title="${esc(t.title)}">${t.label}</span>`;
}

export function sourceLinks(keys: string[]): string {
  const uniq = [...new Set(keys)];
  return uniq
    .map((k) => {
      const s = SOURCES[k];
      if (!s) return `<span class="kt-src-missing">${esc(k)}</span>`;
      return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(`${s.authors} (${s.year}). ${s.title}. ${s.journal ?? ''}`)}">${esc(s.short)}</a>`;
    })
    .join('');
}

function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

export class InfoPanel {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  /** Seek requests from rows in the location card. */
  onSeek: ((t: number) => void) | null = null;
  onClose: (() => void) | null = null;
  kind: 'event' | 'location' | 'about' | 'place' | 'places' | null = null;
  /** Actions from place cards. */
  onPlaceAction: ((action: 'here' | 'fly', id: string) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'kt-panel';
    this.root.hidden = true;
    this.root.setAttribute('data-testid', 'panel');
    this.root.innerHTML = '<button type="button" class="kt-panel-close" aria-label="Close">×</button><div class="kt-panel-body"></div>';
    this.body = this.root.querySelector('.kt-panel-body')!;
    this.root.querySelector('.kt-panel-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('[data-seek]');
      if (row) this.onSeek?.(Number(row.dataset.seek));
      const act = target.closest<HTMLElement>('[data-place-action]');
      if (act) this.onPlaceAction?.(act.dataset.placeAction as 'here' | 'fly', act.dataset.place!);
    });
    parent.append(this.root);
  }

  showEvent(e: TimelineEvent): void {
    const when = e.t_end !== undefined ? `${formatRelative(e.t)} → ${formatRelative(e.t_end)}` : formatRelative(e.t);
    this.body.innerHTML = `
      <div class="kt-kicker">${esc(when)}</div>
      <h2>${esc(e.title)}</h2>
      <div class="kt-chips">${chip(e.confidence)}${e.magnitude ? `<span class="kt-mag">${esc(e.magnitude)}</span>` : ''}</div>
      <p>${esc(e.detail)}</p>
      <div class="kt-sources"><span>Sources</span>${sourceLinks(e.sources)}</div>`;
    this.open('event');
  }

  showLocation(h: LocalHistory, now: number): void {
    const lat = `${Math.abs(h.point.lat).toFixed(1)}°${h.point.lat >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(h.point.lon).toFixed(1)}°${h.point.lon >= 0 ? 'E' : 'W'}`;
    const where = h.elevationM === null ? '' : h.ocean ? `Sea, ${Math.round(-h.elevationM).toLocaleString('en-US')} m deep` : `Land, ${Math.round(h.elevationM).toLocaleString('en-US')} m above sea level`;
    const dist = h.distanceKm < 1 ? 'Ground zero' : `${Math.round(h.distanceKm).toLocaleString('en-US')} km ${compass(h.bearingFromCrater)} of the impact`;
    const rows = h.rows
      .map((r) => {
        const past = r.arrivalS !== null && r.arrivalS <= now;
        const time = r.arrivalS === null ? '—' : formatRelative(r.arrivalS);
        const seek = r.arrivalS === null ? '' : ` data-seek="${r.arrivalS}" role="button" tabindex="0"`;
        return `<li class="kt-row${past ? ' kt-past' : ''}"${seek}>
          <span class="kt-row-time">${esc(time)}</span>
          <span class="kt-row-main"><b>${esc(r.label)}</b> ${chip(r.confidence)}<br><span class="kt-row-val">${esc(r.value)}</span></span>
        </li>`;
      })
      .join('');
    const sources = h.rows.flatMap((r) => r.sources);
    this.body.innerHTML = `
      <div class="kt-kicker">What happened here?</div>
      <h2>${esc(dist)}</h2>
      <div class="kt-coords">${esc(lat)} ${esc(lon)} on the 66-million-year-old map${where ? ` · ${esc(where)}` : ''}</div>
      <ol class="kt-rows">${rows}</ol>
      <p class="kt-note">Tap a row to jump there in time. Positions are in the PALEOMAP 65 Ma frame, not today's map.</p>
      <div class="kt-sources"><span>Sources</span>${sourceLinks(sources)}</div>`;
    this.open('location');
  }

  showPlace(p: Poi): void {
    const fmt = (ll: { lat: number; lon: number }) =>
      `${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'E' : 'W'}`;
    const where = Number.isFinite(p.modern.lat)
      ? `Today ${esc(fmt(p.modern))}; 66 million years ago ${esc(fmt(p.paleo))} (PALEOMAP plate model)`
      : `66 million years ago ${esc(fmt(p.paleo))}`;
    this.body.innerHTML = `
      <div class="kt-kicker">Place${p.tags.includes('context') ? ' · older than the impact' : ''}</div>
      <h2>${esc(p.name)}</h2>
      <div class="kt-coords">${where}</div>
      <p>${esc(p.note)}</p>
      <div class="kt-btn-row">
        <button type="button" data-place-action="here" data-place="${esc(p.id)}">What happened here?</button>
      </div>
      <div class="kt-sources"><span>Sources</span>${sourceLinks(p.sources)}</div>`;
    this.open('place');
  }

  showPlaces(list: readonly Poi[]): void {
    const items = list
      .map((p) => `<li><button type="button" data-place-action="fly" data-place="${esc(p.id)}">${esc(p.name)}<small>${esc(p.note.split('. ')[0])}.</small></button></li>`)
      .join('');
    this.body.innerHTML = `<div class="kt-kicker">Places</div><h2>Where to look</h2><ul class="kt-place-list">${items}</ul>`;
    this.open('places');
  }

  showHtml(kind: 'about', html: string): void {
    this.body.innerHTML = html;
    this.open(kind);
  }

  private open(kind: 'event' | 'location' | 'about' | 'place' | 'places'): void {
    this.kind = kind;
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.kind = null;
    this.onClose?.();
  }
}
