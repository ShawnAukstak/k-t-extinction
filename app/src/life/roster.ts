/** The roster the app uses: curated YAML when present (build-time glob), otherwise the fallback. */
import { FALLBACK_REGIONS, FALLBACK_SPECIES, fromCurated, type RegionDef, type SpeciesDef } from './fauna';

const speciesFiles = import.meta.glob('../../../data/curated/species/*.yaml', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;
const regionFiles = import.meta.glob('../../../data/curated/fauna-regions.yaml', { eager: true, import: 'default' }) as Record<string, { regions?: Record<string, unknown>[] }>;

export function loadRoster(): { species: SpeciesDef[]; regions: RegionDef[]; curated: boolean } {
  const species = Object.values(speciesFiles);
  const regions = Object.values(regionFiles)[0]?.regions ?? [];
  if (species.length && regions.length) {
    const r = fromCurated(species, regions);
    return { ...r, curated: true };
  }
  return { species: FALLBACK_SPECIES, regions: FALLBACK_REGIONS, curated: false };
}
