/**
 * Moments worth seeing (data/curated/moments.yaml): a place, a time and a view, shown as picture cards
 * at the top of Explore. Each opens like a link, optionally with an event card or a fly-down to animals.
 */
import raw from '../../../data/curated/moments.yaml';
import { EVENTS } from './events';
import { poiById } from './pois';
import { parseHash, type ViewState } from './url-state';

export interface Moment {
  id: string;
  title: string;
  blurb: string;
  /** The deep link (after #) and what it parses to. */
  view: string;
  state: ViewState;
  event?: string;
  action?: 'animals';
}

export function validateMoments(data: unknown): Moment[] {
  const list = (data as { moments?: unknown[] })?.moments;
  if (!Array.isArray(list)) throw new Error('moments.yaml: missing `moments` list');
  const ids = new Set<string>();
  return list.map((x, i) => {
    const m = x as Omit<Moment, 'state'>;
    const where = `moments.yaml #${i} (${m?.id ?? '?'})`;
    if (!m.id || !/^[a-z0-9-]+$/.test(m.id) || ids.has(m.id)) throw new Error(`${where}: missing, malformed or duplicate id`);
    ids.add(m.id);
    if (!m.title || !m.blurb || !m.view) throw new Error(`${where}: title, blurb and view are required`);
    const state = parseHash(m.view);
    if (state.t === undefined) throw new Error(`${where}: the view must set a time (t=…)`);
    if (state.preset && !poiById(state.preset)) throw new Error(`${where}: unknown place ${state.preset}`);
    if (m.event && !EVENTS.some((e) => e.id === m.event)) throw new Error(`${where}: unknown event ${m.event}`);
    if (m.action !== undefined && m.action !== 'animals') throw new Error(`${where}: unknown action ${m.action}`);
    if (m.action === 'animals' && !state.preset) throw new Error(`${where}: the animals action needs a place (k=…)`);
    return { ...m, state };
  });
}

export const MOMENTS: readonly Moment[] = validateMoments(raw);
