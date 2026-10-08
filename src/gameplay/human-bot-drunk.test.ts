import { describe, expect, it } from 'vitest';
import { rideDrunk } from './human-run';

// Acceptance for the drunk phase: the human bot (take-off +-4 ticks, three
// hold lengths; it presses about the mean drunk delay early, like a player
// who feels the lag) carries a Maßkrug, drinks it after a few seconds and
// rides the whole drunk phase (core/drunk.ts delays its presses and releases
// by 3..8 ticks). The spawner only lays easy patterns, fair for the
// worst-case delay, so it almost never crashes.
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('drunk human bot', () => {
  for (const [name, from] of [
    ['early in the run', 2000],
    ['at full difficulty', 34000],
  ] as const) {
    it(`survives the drunk phase without a crash in >= 18 of 20 seeds (${name})`, () => {
      const runs = SEEDS.map((seed) => rideDrunk(seed, from));
      const crashed = runs.filter((r) => r.crashes.length > 0);
      expect(runs.every((r) => r.drunkSeconds > 5)).toBe(true);
      expect(crashed.length, JSON.stringify(crashed)).toBeLessThanOrEqual(2);
    }, 120_000);
  }
});
