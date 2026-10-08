import { describe, expect, it } from 'vitest';
import { rideHuman } from './human-run';

// Acceptance for fair people: a sloppy human (take-off +-4 ticks, three hold
// lengths, jittered ducking) never crashes into or within 1 s of a person in
// 3 minutes. Split in two files so Vitest runs them in parallel (human-bot-1.test.ts runs seeds 1-10).
describe('human bot rides 3 min without a person-related crash', () => {
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    it(`seed ${seed}`, () => {
      const run = rideHuman(seed, 180);
      expect(run.crashes.filter((c) => c.personRelated)).toEqual([]);
    }, 120_000);
  }
});
