/** Points of interest: curated text + PALEOMAP 65 Ma positions from scripts/reconstruct_pois.py. */
import curated from '../../../data/curated/points-of-interest.yaml';
import reconstructed from '../../../data/curated/points-of-interest.reconstructed.yaml';
import { IMPACT } from '../config';
import { antipode } from './geo';

export interface Poi {
  id: string;
  name: string;
  modern: { lat: number; lon: number };
  paleo: { lat: number; lon: number };
  tags: string[];
  camera?: { range: number; heading: number; tilt: number };
  note: string;
  sources: string[];
  verified?: boolean;
}

interface CuratedFile { points: Omit<Poi, 'paleo'>[] }
interface ReconstructedFile { points: Record<string, { lat: number; lon: number }> }

function load(): Poi[] {
  const rec = (reconstructed as ReconstructedFile).points;
  const list = (curated as CuratedFile).points.map((p) => {
    const paleo = rec[p.id];
    if (!paleo) throw new Error(`points-of-interest: ${p.id} has no reconstructed position (run scripts/reconstruct_pois.py)`);
    return { ...p, note: p.note.trim(), paleo };
  });
  // The far side of the planet, where re-entering ejecta and seismic waves converge.
  list.push({
    id: 'antipode', name: 'Antipode of the impact', modern: { lat: NaN, lon: NaN },
    paleo: antipode(IMPACT.site.value), tags: ['impact'],
    camera: { range: 3_000_000, heading: 0, tilt: 30 },
    note: 'Exactly opposite the crater. Ejecta re-entering from orbit and seismic waves converged here; at 66 Ma it was open ocean west of Australia–Antarctica.',
    sources: ['kring2002', 'meschede2011'],
  });
  return list;
}

export const POIS: readonly Poi[] = load();

export function poiById(id: string): Poi | undefined {
  return POIS.find((p) => p.id === id);
}
