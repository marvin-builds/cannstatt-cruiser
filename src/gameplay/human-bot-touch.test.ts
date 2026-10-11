import { describe, expect, it } from 'vitest';
import { isOverhead } from './catalogue';
import { rideHuman } from './human-run';
import { HUMAN_TOUCH_STYLE } from './testing';

// ROADMAP 66: a phone player ducks by swiping. The touch human bot's duck
// lasts the swipe's fixed time (core/input.ts SWIPE_DUCK_TICKS), a jump ends
// it, and after a duck ran out it stands a moment before it swipes again.
// It never crashes into an overhead sign in 4 minutes of a real run.
describe('touch human bot ducks every sign with one swipe per duck group', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}`, () => {
      const run = rideHuman(seed, 240, 0, Number.MAX_SAFE_INTEGER, HUMAN_TOUCH_STYLE);
      expect(run.crashes.filter((c) => c.kind !== 'bail' && isOverhead(c.kind))).toEqual([]);
      expect(run.crashes.filter((c) => c.personRelated)).toEqual([]);
    }, 180_000);
  }
});
