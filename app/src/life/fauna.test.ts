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

  it('only non-avian dinosaurs, pterosaurs and marine reptiles are all-dead groups', () => {
    const survivors = roster.species.filter((s) => s.survives).map((s) => s.group);
    for (const g of survivors) expect(['crocodylian', 'champsosaur', 'turtle', 'mammal_small', 'bird', 'frog', 'lizard']).toContain(g);
  });

  it('places fall in the right regions', () => {
    const land = (lat: number, lon: number) => regionAt(roster.regions, { lat, lon }, 'land', dist)?.id;
    const sea = (lat: number, lon: number) => regionAt(roster.regions, { lat, lon }, 'sea', dist)?.id;
    expect(land(51.674, -79.599)).toBe('hell-creek'); // Tanis
    expect(land(34.61, -0.47)).toBe('ibero-armorica'); // Tremp
    expect(sea(25.11, -71.58)).toBe('gulf-atlantic-wis'); // Chicxulub
    expect(sea(0, -150)).toBe('open-ocean'); // mid-Pacific
  });
});
