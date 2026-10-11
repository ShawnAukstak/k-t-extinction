/** Timeline events from data/curated/timeline.yaml (parsed at build time by the Vite YAML plugin). */
import raw from '../../../data/curated/timeline.yaml';
import type { Confidence } from '../config';

export interface TimelineEvent {
  id: string;
  t: number;
  t_end?: number;
  title: string;
  detail: string;
  magnitude?: string;
  confidence: Confidence;
  sources: string[];
  marker?: boolean;
}

const CONFIDENCES: Confidence[] = ['known', 'model', 'contested', 'chosen'];

export function validateEvents(data: unknown): TimelineEvent[] {
  const list = (data as { events?: unknown[] })?.events;
  if (!Array.isArray(list)) throw new Error('timeline.yaml: missing `events` list');
  const ids = new Set<string>();
  return list
    .map((e, i) => {
      const ev = e as TimelineEvent;
      const where = `timeline.yaml event #${i} (${ev?.id ?? '?'})`;
      if (!ev.id || ids.has(ev.id)) throw new Error(`${where}: missing or duplicate id`);
      ids.add(ev.id);
      if (typeof ev.t !== 'number' || !Number.isFinite(ev.t)) throw new Error(`${where}: t must be a number`);
      if (ev.t_end !== undefined && !(ev.t_end >= ev.t)) throw new Error(`${where}: t_end must be ≥ t`);
      if (!ev.title || !ev.detail) throw new Error(`${where}: title and detail are required`);
      if (!CONFIDENCES.includes(ev.confidence)) throw new Error(`${where}: confidence must be one of ${CONFIDENCES.join(', ')}`);
      if (!Array.isArray(ev.sources) || ev.sources.length === 0) throw new Error(`${where}: at least one source`);
      return { ...ev, detail: ev.detail.trim() };
    })
    .sort((a, b) => a.t - b.t);
}

export const EVENTS: readonly TimelineEvent[] = validateEvents(raw);
export const MARKERS: readonly TimelineEvent[] = EVENTS.filter((e) => e.marker);

/** The most recent marker at or before t (the "chapter" we're in), if any. */
export function currentMarker(t: number): TimelineEvent | undefined {
  let found: TimelineEvent | undefined;
  for (const e of MARKERS) if (e.t <= t + 1e-6) found = e;
  return found;
}

export function nextMarker(t: number): TimelineEvent | undefined {
  return MARKERS.find((e) => e.t > t + 1e-3);
}

export function prevMarker(t: number): TimelineEvent | undefined {
  let found: TimelineEvent | undefined;
  for (const e of MARKERS) if (e.t < t - 1e-3) found = e;
  return found;
}
