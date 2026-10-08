import { describe, expect, it } from 'vitest';
import { RAMP_DISTANCE, SPEED_RAMP_DISTANCE } from './difficulty';
import { rideDrunk } from './human-run';

// Acceptance for the drunk phase: the human bot (take-off +-4 ticks, three
// hold lengths; it presses about the mean drunk delay early, like a player
// who feels the lag) carries a Maßkrug, drinks it after a few seconds and
// rides the whole drunk phase (core/drunk.ts delays its presses and releases
// by DRUNK_DELAY_MIN..MAX ticks and wobbles its holds; it holds on for a sure
// full jump). The spawner only lays easy patterns, fair for the worst-case
// delay, so it almost never crashes, yet the street is not empty.
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('drunk human bot', () => {
  for (const [name, from] of [
    ['early in the run', 2000],
    ['at full difficulty (top speed)', Math.max(RAMP_DISTANCE, SPEED_RAMP_DISTANCE) + 1000],
  ] as const) {
    it(`survives the drunk phase without a crash in >= 18 of 20 seeds (${name})`, () => {
      const runs = SEEDS.map((seed) => rideDrunk(seed, from));
      const crashed = runs.filter((r) => r.crashes.length > 0);
      expect(runs.every((r) => r.drunkSeconds > 5)).toBe(true);
      expect(crashed.length, JSON.stringify(crashed)).toBeLessThanOrEqual(2);
      // Not an empty street: the drunk phase has obstacles to jump.
      const cleared = runs.reduce((sum, r) => sum + r.cleared, 0);
      expect(cleared / runs.length, `${cleared} cleared`).toBeGreaterThanOrEqual(1);
    }, 120_000);
  }
});
