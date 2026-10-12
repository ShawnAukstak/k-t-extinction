import { describe, expect, it } from 'vitest';
import { centralAngle } from '../core/geo';
import { SOURCES } from '../core/sources';
import { regionAt } from './fauna';
import { loadRoster } from './roster';

const BODY_GROUPS = ['ceratopsid', 'hadrosaur', 'tyrannosaurid', 'small_theropod', 'ornithomimid', 'oviraptorosaur',
  'ankylosaur', 'pachycephalosaur', 'sauropod', 'small_ornithischian', 'crocodylian', 'champsosaur', 'turtle',
  'mammal_small', 'bird', 'pterosaur', 'mosasaur', 'plesiosaur', 'frog', 'lizard'];
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => centralAngle(a, b) * 6371;

describe('curated fauna', async () => {
  const roster = await loadRoster();

  it('loads the curated cards, not the fallback', () => {
    expect(roster.curated).toBe(true);
    expect(roster.species.length).toBeGreaterThan(20);
    expect(roster.regions.length).toBeGreaterThan(10);
  });

  it('every species has sane measurements and a body plan we can draw', () => {
    for (const s of roster.species) {
      expect(BODY_GROUPS, s.id).toContain(s.group);
      expect(s.lengthM, s.id).toBeGreaterThan(0.05);
      expect(s.lengthM, s.id).toBeLessThan(40);
      expect(s.massKg, s.id).toBeGreaterThan(0);
      expect(s.hipHeightM, s.id).toBeGreaterThan(0);
      expect(s.groupSize[0], s.id).toBeLessThanOrEqual(s.groupSize[1]);
      expect(s.sources.length, s.id).toBeGreaterThan(0);
    }
  });

  it('every species named in a region has a card, and every source is in the bibliography', () => {
    const ids = new Set(roster.species.map((s) => s.id));
    for (const r of roster.regions) for (const f of r.fauna) expect(ids, `${r.id}: ${f.species}`).toContain(f.species);
    const missing = new Set<string>();
    for (const s of roster.species) for (const k of [...s.sources, s.survival?.source ?? '']) if (k && !SOURCES[k]) missing.add(`${s.id}: ${k}`);
    expect([...missing]).toEqual([]);
  });

  it('recovery timing is consistent, sourced, and regional overrides name regions the species lives in', () => {
    const recovery = roster.species.filter((s) => s.recovery);
    expect(recovery.length).toBeGreaterThan(3);
    for (const s of recovery) {
      const all = [['card', s.recovery!] as const, ...Object.entries(s.recovery!.byRegion ?? {})];
      for (const [where, r] of all) {
        expect(r.appearsYears, `${s.id} ${where}`).toBeGreaterThan(0);
        if (r.rangeYears) {
          expect(r.appearsYears, `${s.id} ${where}`).toBeGreaterThanOrEqual(Math.min(...r.rangeYears));
          expect(r.appearsYears, `${s.id} ${where}`).toBeLessThanOrEqual(Math.max(...r.rangeYears));
        }
        if (r.source) expect(SOURCES[r.source], `${s.id} ${where}: ${r.source}`).toBeTruthy();
      }
      for (const id of Object.keys(s.recovery!.byRegion ?? {})) {
        const entry = roster.regions.find((r) => r.id === id)?.fauna.find((f) => f.species === s.id);
        expect(entry, `${s.id} by_region ${id}`).toBeTruthy();
        expect(entry!.recovery).toBe(s.recovery!.byRegion![id]);
      }
    }
    // Ectoconus: San Juan Basin record from ~360 kyr (Flynn et al. 2020); Corral Bluffs from ~417 kyr (Lyson et al. 2019).
    const fa = (region: string) => roster.regions.find((r) => r.id === region)!.fauna.find((f) => f.species === 'ectoconus')!;
    expect(fa('south-laramidia').recovery?.appearsYears).toBe(360000);
    expect(fa('hell-creek').recovery).toBeUndefined();
  });

  it('only non-avian dinosaurs, pterosaurs and marine reptiles are all-dead groups', () => {
    const survivors = roster.species.filter((s) => s.survives).map((s) => s.group);
    for (const g of survivors) expect(['crocodylian', 'champsosaur', 'turtle', 'mammal_small', 'bird', 'frog', 'lizard']).toContain(g);
  });

  it('places fall in the right regions', () => {
    const land = (lat: number, lon: number) => regionAt(roster.regions, { lat, lon }, 'land', dist)?.id;
    const sea = (lat: number, lon: number) => regionAt(roster.regions, { lat, lon }, 'sea', dist)?.id;
    expect(land(51.674, -79.599)).toBe('hell-creek'); // Tanis
    expect(land(34.61, -0.47)).toBe('ibero-armorica'); // Tremp
    expect(land(44.94, -83.11)).toBe('hell-creek'); // Corral Bluffs, Denver Basin (northern fauna, not Alamosaurus)
    expect(land(39.83, -86.98)).toBe('south-laramidia');
    expect(sea(25.11, -71.58)).toBe('gulf-atlantic-wis'); // Chicxulub
    expect(sea(0, -150)).toBe('open-ocean'); // mid-Pacific
  });
});
