/**
 * Who lives where: species definitions and regional rosters. Loaded from data/curated/species/*.yaml
 * and data/curated/fauna-regions.yaml when present (curated with sources), with a small built-in
 * Hell Creek roster as a fallback so the renderer always has something honest to show.
 */
import type { BodyGroup } from './bodies';
import type { LatLon } from '../core/geo';

export interface SpeciesDef {
  id: string;
  name: string;
  group: BodyGroup;
  lengthM: number;
  hipHeightM: number;
  massKg: number;
  groupSize: [number, number];
  diet: 'herbivore' | 'carnivore' | 'omnivore';
  walkSpeed: number;
  /** Non-avian dinosaurs and pterosaurs did not survive; crocodylians, turtles, mammals and birds partly did. */
  survives: boolean;
  notes?: string;
  sources: string[];
}

export interface RegionDef {
  id: string;
  name: string;
  center: LatLon;
  radiusKm: number;
  fauna: { species: string; abundance: number; group?: [number, number] }[];
}

/** Built-in fallback (Hell Creek; Horner, Goodwin & Myhrvold 2011 census; Benson et al. 2014 masses). */
export const FALLBACK_SPECIES: SpeciesDef[] = [
  { id: 'triceratops', name: 'Triceratops', group: 'ceratopsid', lengthM: 8, hipHeightM: 2.3, massKg: 9500, groupSize: [1, 4], diet: 'herbivore', walkSpeed: 1.6, survives: false, sources: ['horner2011', 'benson2014'] },
  { id: 'edmontosaurus', name: 'Edmontosaurus', group: 'hadrosaur', lengthM: 11, hipHeightM: 2.6, massKg: 6000, groupSize: [6, 30], diet: 'herbivore', walkSpeed: 1.5, survives: false, sources: ['horner2011', 'benson2014'] },
  { id: 'tyrannosaurus', name: 'Tyrannosaurus rex', group: 'tyrannosaurid', lengthM: 12, hipHeightM: 3.2, massKg: 8000, groupSize: [1, 1], diet: 'carnivore', walkSpeed: 1.4, survives: false, sources: ['horner2011', 'benson2014', 'marshall2021'] },
  { id: 'thescelosaurus', name: 'Thescelosaurus', group: 'small_ornithischian', lengthM: 3.5, hipHeightM: 0.9, massKg: 300, groupSize: [1, 3], diet: 'herbivore', walkSpeed: 1.3, survives: false, sources: ['horner2011'] },
  { id: 'ornithomimus', name: 'Ornithomimus', group: 'ornithomimid', lengthM: 4, hipHeightM: 1.4, massKg: 170, groupSize: [2, 8], diet: 'omnivore', walkSpeed: 2.0, survives: false, sources: ['horner2011'] },
];

export const FALLBACK_REGIONS: RegionDef[] = [{
  id: 'hell-creek', name: 'Northern Laramidia (Hell Creek)', center: { lat: 52.5, lon: -81.0 }, radiusKm: 1200,
  fauna: [
    { species: 'triceratops', abundance: 0.40 },
    { species: 'tyrannosaurus', abundance: 0.24 },
    { species: 'edmontosaurus', abundance: 0.20 },
    { species: 'thescelosaurus', abundance: 0.08 },
    { species: 'ornithomimus', abundance: 0.05 },
  ],
}];

/**
 * Population density (individuals/km²) from body mass, after Damuth's (1981) mass–density scaling
 * for mammalian herbivores (D = 10^(4.23 − 0.75·log10 M[g])); carnivores ~10× sparser. Applying it to
 * dinosaurs is a model assumption; it gives T. rex ≈ 1 per 100 km², close to Marshall et al. 2021.
 */
export function densityPerKm2(massKg: number, diet: SpeciesDef['diet']): number {
  const herb = 10 ** (4.23 - 0.75 * Math.log10(massKg * 1000));
  return diet === 'carnivore' ? herb * 0.1 : diet === 'omnivore' ? herb * 0.5 : herb;
}

/** Turn the curated YAML (if any) into SpeciesDef/RegionDef; tolerant of missing optional fields. */
export function fromCurated(species: Record<string, unknown>[], regions: Record<string, unknown>[]): { species: SpeciesDef[]; regions: RegionDef[] } {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const sp: SpeciesDef[] = species.map((s) => {
    const size = (s.size ?? {}) as Record<string, unknown>;
    const len = size.length_m as { typical?: number } | number | undefined;
    const lengthM = typeof len === 'number' ? len : num(len?.typical, 3);
    const mass = size.mass_kg as { value?: number } | number | undefined;
    const beh = (s.behaviour ?? {}) as Record<string, unknown>;
    const gs = (beh.group_size as { typical?: [number, number] } | undefined)?.typical ?? [1, 2];
    const speed = beh.speed_m_s as { walk?: number } | undefined;
    const group = String(s.group ?? 'lizard') as BodyGroup;
    const dietRaw = String(beh.diet ?? 'herbivore');
    const diet: SpeciesDef['diet'] = /carn|pisc|predator/.test(dietRaw) ? 'carnivore' : /omni|insect/.test(dietRaw) ? 'omnivore' : 'herbivore';
    const dinoLike = ['ceratopsid', 'hadrosaur', 'tyrannosaurid', 'small_theropod', 'ornithomimid', 'oviraptorosaur', 'ankylosaur', 'pachycephalosaur', 'sauropod', 'small_ornithischian', 'pterosaur', 'mosasaur', 'plesiosaur'];
    return {
      id: String(s.id), name: String(s.name ?? s.id), group, lengthM,
      hipHeightM: num(size.hip_height_m, lengthM * 0.25),
      massKg: typeof mass === 'number' ? mass : num(mass?.value, 100),
      groupSize: [num(gs[0], 1), num(gs[1], num(gs[0], 1))],
      diet, walkSpeed: num(speed?.walk, 1.4),
      survives: !dinoLike.includes(group),
      notes: typeof s.notes === 'string' ? s.notes.trim() : undefined,
      sources: Array.isArray(s.sources) ? (s.sources as string[]) : [],
    };
  });
  const rg: RegionDef[] = regions.map((r) => {
    const c = (r.paleo_center ?? r.center ?? {}) as { lat?: number; lon?: number };
    const fauna = Array.isArray(r.fauna) ? (r.fauna as Record<string, unknown>[]) : [];
    return {
      id: String(r.id), name: String(r.name ?? r.id), center: { lat: num(c.lat, 0), lon: num(c.lon, 0) }, radiusKm: num(r.radius_km, 800),
      fauna: fauna.map((f) => ({ species: String(f.species), abundance: num(f.relative_abundance ?? f.abundance, 0.1), group: f.group as [number, number] | undefined })),
    };
  });
  return { species: sp, regions: rg };
}
