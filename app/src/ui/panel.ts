/**
 * The info card: event details with sources, and "what happened here?" for a tapped location.
 * Every number carries its confidence (known / model / contested / chosen) and links its sources.
 */
import type { Confidence } from '../config';
import type { TimelineEvent } from '../core/events';
import type { LocalHistory } from '../core/local-history';
import type { Moment } from '../core/moments';
import type { Poi } from '../core/pois';
import type { FaunaEntry, SpeciesDef } from '../life/fauna';
import { FEATHERED } from '../life/bodies';
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

/** "100,000 years", "1.2 million years". */
function formatYears(y: number): string {
  return y >= 1e6 ? `${(y / 1e6).toFixed(y % 1e6 ? 1 : 0)} million years` : `${Math.round(y).toLocaleString('en-US')} years`;
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
  kind: 'event' | 'location' | 'about' | 'place' | 'places' | 'species' | null = null;
  /** Actions from place cards. */
  onPlaceAction: ((action: 'here' | 'fly' | 'animals', id: string) => void) | null = null;
  /** City search (Places panel). */
  cities: { name: string; country: string; pop: number; lat: number; lon: number; paleoLat: number; paleoLon: number }[] = [];
  onNeedCities: (() => Promise<void>) | null = null;
  onCity: ((c: InfoPanel['cities'][number]) => void) | null = null;
  onLocate: (() => void) | null = null;
  /** A moment card was picked (Explore). */
  onMoment: ((id: string) => void) | null = null;

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
      if (act) this.onPlaceAction?.(act.dataset.placeAction as 'here' | 'fly' | 'animals', act.dataset.place!);
      const mom = target.closest<HTMLElement>('[data-moment]');
      if (mom) this.onMoment?.(mom.dataset.moment!);
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

  showLocation(h: LocalHistory, now: number, label?: string): void {
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
      <div class="kt-kicker">${label ? `${esc(label)} · 66 million years ago` : 'What happened here?'}</div>
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
        ${p.tags.includes('fauna') ? `<button type="button" data-place-action="animals" data-place="${esc(p.id)}">Find dinosaurs nearby</button>` : ''}
      </div>
      <div class="kt-sources"><span>Sources</span>${sourceLinks(p.sources)}</div>`;
    this.open('place');
  }

  /** Explore: moments (place + time), then "where was my city?", then places. */
  showExplore(moments: readonly Moment[], list: readonly Poi[]): void {
    const base = import.meta.env.BASE_URL;
    const cards = moments
      .map((m) => `<li><button type="button" class="kt-moment" data-moment="${esc(m.id)}" title="${esc(m.blurb)}">
          <img src="${base}moments/${esc(m.id)}.jpg" alt="" loading="lazy" width="160" height="90" />
          <span>${esc(m.title)}</span></button></li>`)
      .join('');
    this.showPlaces(list, `
      <div class="kt-kicker">Moments</div>
      <ul class="kt-moments" data-testid="moments">${cards}</ul>`);
    this.kind = 'places';
  }

  showPlaces(list: readonly Poi[], before = ''): void {
    const items = list
      .map((p) => `<li><button type="button" data-place-action="fly" data-place="${esc(p.id)}">${esc(p.name)}<small>${esc(p.note.split('. ')[0])}.</small></button></li>`)
      .join('');
    this.body.innerHTML = `${before}
      <div class="kt-kicker"${before ? ' style="margin-top:14px"' : ''}>Where do you live today?</div>
      <div class="kt-search">
        <input type="search" placeholder="Search a city…" aria-label="Search a city" autocomplete="off" />
        <button type="button" class="kt-locate" title="Uses your device's location; nothing is sent anywhere">Use my location</button>
      </div>
      <ul class="kt-place-list kt-results"></ul>
      <div class="kt-kicker" style="margin-top:14px">Places</div><h2>Where to look</h2><ul class="kt-place-list">${items}</ul>`;
    this.open('places');
    const input = this.body.querySelector<HTMLInputElement>('input')!;
    const results = this.body.querySelector<HTMLUListElement>('.kt-results')!;
    const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const render = () => {
      const q = fold(input.value.trim());
      if (q.length < 2) { results.innerHTML = ''; return; }
      const hits = this.cities
        .filter((c) => fold(c.name).startsWith(q) || fold(`${c.name}, ${c.country}`).includes(q))
        .slice(0, 8);
      results.innerHTML = hits.length
        ? hits.map((c, i) => `<li><button type="button" data-city="${i}">${esc(c.name)}<small>${esc(c.country)}</small></button></li>`).join('')
        : '<li class="kt-note">No match in the 4,000 largest places.</li>';
      results.querySelectorAll<HTMLButtonElement>('[data-city]').forEach((b) =>
        b.addEventListener('click', () => this.onCity?.(hits[Number(b.dataset.city)])));
    };
    input.addEventListener('focus', () => { void this.onNeedCities?.().then(render); }, { once: true });
    input.addEventListener('input', render);
    this.body.querySelector('.kt-locate')!.addEventListener('click', () => this.onLocate?.());
  }

  showSpecies(sp: SpeciesDef, entry?: FaunaEntry, extra = ''): void {
    const mass = sp.massKg >= 1000 ? `${(sp.massKg / 1000).toFixed(sp.massKg >= 10_000 ? 0 : 1)} t` : `${Math.round(sp.massKg)} kg`;
    const group = sp.groupSize[1] > 1 ? `usually ${sp.groupSize[0]}–${sp.groupSize[1]} together` : 'usually alone';
    const proxy = entry?.proxyFor;
    const title = proxy ? proxy[0].toUpperCase() + proxy.slice(1) : sp.name;
    const conf = (c?: string) => (c === 'known' || c === 'model' || c === 'contested' || c === 'chosen' ? c : 'model');
    const note = sp.survival?.note ? sp.survival.note.replace(/^(yes|no)\b[.;,:]?\s*/i, '') : '';
    const rec = entry?.recovery ?? sp.recovery;
    const survived = rec
      ? `<p class="kt-note">${chip(conf(rec.confidence))} <strong>After the extinction:</strong> first appears about ${esc(formatYears(rec.appearsYears))} after the impact${rec.note ? ` — ${esc(rec.note)}` : ''}.</p>`
      : `<p><strong>Survived the extinction:</strong> ${sp.survives ? 'yes' : 'no'}${note ? ` — ${esc(note[0].toUpperCase() + note.slice(1)).replace(/\.?$/, '.')}` : '.'}</p>`;
    this.body.innerHTML = `
      <div class="kt-kicker">Animal${proxy ? ' · stand-in' : ''}</div>
      <h2>${esc(title)}</h2>
      ${proxy ? `<p class="kt-note">${chip('chosen')} Shown with the <strong>${esc(sp.name)}</strong> model and card as a stand-in: these animals have no card of their own yet.</p>` : ''}
      <div class="kt-chips">${chip('model')}<span class="kt-mag">${proxy ? `${esc(sp.name)}: ` : ''}${sp.lengthM} m long · ${mass} · ${esc(group)}</span></div>
      ${entry?.note ? `<p class="kt-note">${chip(conf(entry.confidence))} Here: ${esc(entry.note)}</p>` : entry ? `<p class="kt-note">${chip(conf(entry.confidence))} Lives in this region.</p>` : ''}
      ${sp.olderRecord ? `<p class="kt-note">${chip('chosen')} Older record, shown as representative: ${esc(sp.olderRecord)}</p>` : ''}
      ${sp.notes ? `<p>${esc(sp.notes)}</p>` : ''}
      ${survived}
      ${extra}
      <p class="kt-note">${chip('chosen')} The 3-D model is a simplified reconstruction: proportions from skeletal reconstructions, ${FEATHERED.has(sp.group) ? 'feathered as its close relatives are known to have been' : 'scaly or bare skin as current evidence suggests'}. Colours and patterns are unknown and are a guess.</p>
      <div class="kt-sources"><span>Sources</span>${sourceLinks([...sp.sources, ...[sp.survival?.source, rec?.source].filter((x): x is string => !!x)])}</div>`;
    this.open('species');
  }

  showHtml(kind: 'about', html: string): void {
    this.body.innerHTML = html;
    this.open(kind);
  }

  private open(kind: NonNullable<InfoPanel['kind']>): void {
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
