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
  /** Why we say it did or didn't survive, with its source (curated cards). */
  survival?: { note?: string; source?: string };
  /** Set for D12 'representative / older record' cards: why the record is older than the impact. */
  olderRecord?: string;
  notes?: string;
  sources: string[];
}

export interface FaunaEntry {
  species: string;
  abundance: number;
  /** Abundances compare only within a guild (land_large, land_small, freshwater, air, sea). */
  guild?: string;
  group?: [number, number];
  /** The card stands in for these animals here (they have no card of their own). */
  proxyFor?: string;
  confidence?: string;
  note?: string;
}

export interface RegionDef {
  id: string;
  name: string;
  kind: 'land' | 'sea';
  /** Union of discs (fossil areas); the first is the coarse whole-region disc. None for the open ocean. */
  discs: { center: LatLon; radiusKm: number }[];
  fauna: FaunaEntry[];
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
  id: 'hell-creek', name: 'Northern Laramidia (Hell Creek)', kind: 'land', discs: [{ center: { lat: 52.5, lon: -81.0 }, radiusKm: 1200 }],
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
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
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
    const diet: SpeciesDef['diet'] = /^(carn|pisc|predator)/.test(dietRaw) ? 'carnivore' : /^(omni|insect)/.test(dietRaw) ? 'omnivore' : 'herbivore';
    const dinoLike = ['ceratopsid', 'hadrosaur', 'tyrannosaurid', 'small_theropod', 'ornithomimid', 'oviraptorosaur', 'ankylosaur', 'pachycephalosaur', 'sauropod', 'small_ornithischian', 'pterosaur', 'mosasaur', 'plesiosaur'];
    const sk = s.survived_kpg as { value?: unknown; note?: unknown; source?: unknown } | boolean | undefined;
    const skv = typeof sk === 'boolean' ? sk : sk?.value;
    const age = (s.age ?? {}) as Record<string, unknown>;
    return {
      id: String(s.id), name: String(s.name ?? s.id), group, lengthM,
      hipHeightM: num(size.hip_height_m, lengthM * 0.25),
      massKg: typeof mass === 'number' ? mass : num(mass?.value, 100),
      groupSize: [num(gs[0], 1), num(gs[1], num(gs[0], 1))],
      diet, walkSpeed: num(speed?.walk, 1.4),
      survives: typeof skv === 'boolean' ? skv : !dinoLike.includes(group),
      survival: typeof sk === 'object' && sk ? { note: str(sk.note), source: str(sk.source) } : undefined,
      olderRecord: age.context_only === true ? str(age.why) ?? 'An older record, shown as representative.' : undefined,
      notes: str(s.notes),
      sources: Array.isArray(s.sources) ? (s.sources as string[]) : [],
    };
  });
  const rg: RegionDef[] = regions.map((r) => {
    const ll = (v: unknown): LatLon | null => {
      const c = v as { lat?: unknown; lon?: unknown } | null | undefined;
      return c && typeof c.lat === 'number' && typeof c.lon === 'number' ? { lat: c.lat, lon: c.lon } : null;
    };
    const discs: RegionDef['discs'] = [];
    const c = ll(r.paleo_center ?? r.center);
    if (c) discs.push({ center: c, radiusKm: num(r.radius_km, 800) });
    for (const sub of Array.isArray(r.subcenters) ? (r.subcenters as Record<string, unknown>[]) : []) {
      const sc = ll(sub);
      if (sc) discs.push({ center: sc, radiusKm: num(sub.radius_km, 300) });
    }
    const fauna = Array.isArray(r.fauna) ? (r.fauna as Record<string, unknown>[]) : [];
    return {
      id: String(r.id), name: String(r.name ?? r.id), kind: r.kind === 'sea' ? 'sea' : 'land', discs,
      fauna: fauna.map((f) => ({
        species: String(f.species), abundance: num(f.relative_abundance ?? f.abundance, 0.1),
        guild: str(f.guild), group: f.group as [number, number] | undefined,
        proxyFor: str(f.proxy_for), confidence: str(f.confidence), note: str(f.note),
      })),
    };
  });
  return { species: sp, regions: rg };
}

/**
 * The region of a kind that a point belongs to: inside any of its discs, the one whose disc is
 * relatively nearest wins (distance / radius). A sea region without discs (the open ocean) is the
 * fallback for any sea point.
 */
export function regionAt(regions: RegionDef[], ll: LatLon, kind: 'land' | 'sea', distKm: (a: LatLon, b: LatLon) => number): RegionDef | null {
  let best: RegionDef | null = null, bestScore = 1, fallback: RegionDef | null = null;
  for (const r of regions) {
    if (r.kind !== kind) continue;
    if (!r.discs.length) { fallback ??= r; continue; }
    for (const d of r.discs) {
      const score = distKm(ll, d.center) / d.radiusKm;
      if (score < bestScore) { bestScore = score; best = r; }
    }
  }
  return best ?? fallback;
}
