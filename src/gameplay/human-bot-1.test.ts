import { describe, expect, it } from 'vitest';
import { rideHuman } from './human-run';

// Acceptance for fair people: a sloppy human (take-off +-4 ticks, three hold
// lengths, jittered ducking) never crashes into or within 1 s of a person in
// 3 minutes. Split in two files so Vitest runs them in parallel (human-bot-2.test.ts runs seeds 11-20).
describe('human bot rides 3 min without a person-related crash', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    it(`seed ${seed}`, () => {
      const run = rideHuman(seed, 180);
      expect(run.crashes.filter((c) => c.personRelated)).toEqual([]);
      // ROADMAP 41: a down press in the air to duck under a banner starts a kickflip, but the bot holds down
      // to the landing (a duck landing), so it never bails.
      expect(run.crashes.filter((c) => c.kind === 'bail')).toEqual([]);
    }, 120_000);
  }
});
