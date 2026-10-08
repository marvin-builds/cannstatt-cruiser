import { describe, expect, it } from 'vitest';
import type { EntityKind } from '../types';
import { isOverhead, isPerson, isRail } from './catalogue';
import { RAMP_DISTANCE, SPEED_RAMP_DISTANCE } from './difficulty';
import { type Effect, rideEffect } from './effect-street';

// ROADMAP 26: the drunk and the chill effect are only fun with something to
// jump. While either is on, the skater never rides more than about 3 s of
// empty street (at the speed of the moment), early in the run, in the middle
// and at the top speed. Before the fix: up to 6.0 s (the whole effect) for
// both; after it about 2-2.7 s, a little more only where a Wasen visitor's
// Maßkrug makes the chilled street drunk too (the drunk run-up).
const MAX_EMPTY = 3.3;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const FROM = [
  ['early in the run', 2000],
  ['in the middle', 15000],
  ['at full difficulty (top speed)', Math.max(RAMP_DISTANCE, SPEED_RAMP_DISTANCE) + 1000],
] as const;

const hardWhileDrunk = (k: EntityKind) => isPerson(k) || isOverhead(k) || isRail(k);

describe('obstacles during effects', () => {
  for (const effect of ['drunk', 'chill'] as Effect[]) {
    for (const [name, from] of FROM) {
      it(`${effect}: never more than ${MAX_EMPTY} s of empty street, ${name}`, () => {
        const runs = SEEDS.map((seed) => rideEffect(seed, from, effect));
        const worst = runs.reduce((a, b) => (b.maxEmpty > a.maxEmpty ? b : a));
        expect(worst.maxEmpty, `seed ${worst.seed}`).toBeLessThanOrEqual(MAX_EMPTY);
        for (const r of runs) expect(r.effectSeconds).toBeGreaterThan(5);
        if (effect === 'drunk') expect(runs.flatMap((r) => r.kinds).filter(hardWhileDrunk)).toEqual([]);
      }, 60_000);
    }
  }
});
