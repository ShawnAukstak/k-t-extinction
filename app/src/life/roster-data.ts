/** The curated species cards and fauna regions, bundled as their own chunk (loaded when animals are first needed). */
export const speciesFiles = import.meta.glob('../../../data/curated/species/*.yaml', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;
export const regionFiles = import.meta.glob('../../../data/curated/fauna-regions.yaml', { eager: true, import: 'default' }) as Record<string, { regions?: Record<string, unknown>[] }>;
