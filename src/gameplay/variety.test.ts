import { describe, expect, it } from 'vitest';
import { MIX_NAMES } from './mixes';
import { TEMPLATE_NAMES } from './patterns';
import { rideVariety, summarise } from './variety';

describe('variety measure (ROADMAP 52 6a)', () => {
  it('reports every pattern the spawner lays in a real run, in street order, with its elements', () => {
    const ride = rideVariety(1, 60);
    expect(ride.length).toBeGreaterThan(15);
    for (let i = 1; i < ride.length; i++) expect(ride[i]!.street).toBeGreaterThan(ride[i - 1]!.street);
    const templates = ride.filter((p) => TEMPLATE_NAMES.includes(p.name));
    expect(templates.length).toBeGreaterThan(10);
    // A single is one element, a pair two (stars are no element).
    for (const p of templates.filter((x) => x.name === 'single')) expect(p.elements).toBe(1);
    for (const p of templates.filter((x) => x.name === 'pair')) expect(p.elements).toBe(2);
  }, 60_000);

  it('summarises elements per template pattern and distinct templates per ride', () => {
    const s = summarise([
      { name: 'single', street: 0, elements: 1 },
      { name: 'pair', street: 10, elements: 2 },
      { name: 'stunt', street: 20, elements: 7 },
      { name: 'single', street: 30, elements: 1 },
    ]);
    expect(s.patterns).toBe(3);
    expect(s.elements).toBeCloseTo(4 / 3, 9);
    expect(s.distinct).toBe(2);
  });

  // ROADMAP 52 6a (combinations, mixes.ts), measured over 20 seeds x 3 min from the run start, nobody steering.
  // Template patterns only (no stunt lines, park, joint). Tier 3 = from street distance 9600 (~1.5 min) on.
  //   before (2026-10-11): 51 patterns per ride, 1.39 elements per pattern (tier 3: 1.52), 11 distinct templates
  //   after:               45 patterns per ride, 1.74 elements per pattern (tier 3: 2.18), 16.3 distinct templates
  // Pinned here with 6 of those seeds (the 20 take 90 s).
  it('more elements per pattern and more distinct templates per 3 min (6 seeds)', () => {
    const rides = Array.from({ length: 6 }, (_, i) => rideVariety(i + 1, 180));
    const all = summarise(rides.flat());
    const late = summarise(rides.flat().filter((p) => p.street >= 9600));
    const distinct = rides.reduce((n, r) => n + summarise(r).distinct, 0) / rides.length;
    expect(all.elements).toBeGreaterThanOrEqual(1.6);
    expect(late.elements).toBeGreaterThanOrEqual(2);
    expect(distinct).toBeGreaterThanOrEqual(15);
    // Most combinations come up within these rides (all of them over the 20 seeds).
    const seen = new Set(rides.flat().map((p) => p.name));
    expect(MIX_NAMES.filter((name) => seen.has(name)).length).toBeGreaterThanOrEqual(MIX_NAMES.length - 3);
  }, 240_000);
});
