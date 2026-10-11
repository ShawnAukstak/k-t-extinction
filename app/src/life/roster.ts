/** The roster the app uses: curated YAML when present, otherwise the fallback. Loaded on demand. */
import { FALLBACK_REGIONS, FALLBACK_SPECIES, fromCurated, type RegionDef, type SpeciesDef } from './fauna';

export async function loadRoster(): Promise<{ species: SpeciesDef[]; regions: RegionDef[]; curated: boolean }> {
  const { speciesFiles, regionFiles } = await import('./roster-data');
  const species = Object.values(speciesFiles);
  const regions = Object.values(regionFiles)[0]?.regions ?? [];
  if (species.length && regions.length) return { ...fromCurated(species, regions), curated: true };
  return { species: FALLBACK_SPECIES, regions: FALLBACK_REGIONS, curated: false };
}
