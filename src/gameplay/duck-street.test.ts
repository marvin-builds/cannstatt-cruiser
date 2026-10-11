import { describe, expect, it } from 'vitest';
import { BASE_SPEED } from '../core/config';
import { Rng } from '../core/rng';
import { isOverhead, obstacleRect } from './catalogue';
import { CHILL_SPEED_SCALE } from './chill';
import { TOP_SPEED } from './difficulty';
import { rideDucks } from './duck-ride';
import { duckGroups, MAX_ONE_GO_SIGNS, ONE_GO_DUCK_SECONDS, touchDuckable } from './duck-span';
import { MIX_TEMPLATES } from './mixes';
import { type Piece, planPattern } from './patterns';

const SIGN_MIXES = MIX_TEMPLATES.filter((t) => ['mixedFour', 'mixedFive', 'duckJumpDuck', 'duckGauntlet'].includes(t.name)).map((t) => t.name);

describe('planned patterns keep every duck within one swipe (ROADMAP 66)', () => {
  const cases = [
    { name: 'start speed', speeds: [BASE_SPEED] },
    { name: 'top speed', speeds: [TOP_SPEED] },
    { name: 'ramp', speeds: [BASE_SPEED, 120] },
  ];
  for (const { name, speeds } of cases) {
    it(`sign chains (${name}): at most ${MAX_ONE_GO_SIGNS} signs and ${ONE_GO_DUCK_SECONDS} s in one go`, () => {
      let signs = 0;
      for (const template of SIGN_MIXES) {
        for (let seed = 1; seed <= 12; seed++) {
          const p = planPattern(new Rng(seed), 3, speeds, { template });
          signs += p.pieces.filter((x) => isOverhead(x.kind)).length;
          for (const v of speeds) for (const g of duckGroups(p.pieces, v)) expect(g.signs, `${template} seed ${seed}`).toBeLessThanOrEqual(MAX_ONE_GO_SIGNS);
          expect(touchDuckable(p.pieces, speeds), `${template} seed ${seed}: ${JSON.stringify(p.pieces.filter((x) => isOverhead(x.kind)).map((x) => x.x))}`).toBe(true);
        }
      }
      expect(signs).toBeGreaterThan(30);
    }, 120_000);
  }

  it('also while the chill effect may slow the street down', () => {
    const chillSpeeds = [BASE_SPEED * CHILL_SPEED_SCALE, BASE_SPEED];
    for (let seed = 1; seed <= 30; seed++) {
      const p = planPattern(new Rng(seed), 3, [BASE_SPEED], { chillSpeeds, template: seed % 2 ? 'duckJump' : 'duck' });
      expect(touchDuckable(p.pieces, [...chillSpeeds, BASE_SPEED]), `seed ${seed}`).toBe(true);
    }
  }, 60_000);

  it('across the boundary: a sign right after the previous pattern\'s sign chain joins it only within one go', () => {
    for (const speed of [BASE_SPEED, TOP_SPEED]) {
      // The previous pattern ends with two signs ducked in one go, right before this one's lead.
      const tail: Piece[] = [
        { kind: 'stopSign', ...obstacleRect('stopSign', -70) },
        { kind: 'stopSign', ...obstacleRect('stopSign', -30) },
      ];
      for (let seed = 1; seed <= 15; seed++) {
        const p = planPattern(new Rng(seed), 3, [speed], { before: tail, template: seed % 3 ? 'duck' : 'mixedFour' });
        expect(touchDuckable([...tail, ...p.pieces], [speed], 0), `${speed} seed ${seed}`).toBe(true);
      }
    }
  }, 120_000);
});

// ROADMAP 66: on a phone a swipe ducks for a fixed time, so the street never
// asks for a longer duck in one go than ONE_GO_DUCK_SECONDS, at the speed it
// is ridden (chill slowdown included), across pattern boundaries, waves and
// hazards. 10 seeds x 6 min, nobody steering. Longest one go (worst seed) /
// most signs in one go:
//   before (2026-10-11): 1.36 s / 3 signs (seed 4: a sign and two more 0.15-0.5 s behind)
//   after:               0.83 s / 2 signs
describe('duck groups on the street (spawner rides, 10 seeds x 6 min)', { timeout: 300_000 }, () => {
  const rides = Array.from({ length: 10 }, (_, i) => rideDucks(i + 1, 360));

  it(`never a duck longer than ${ONE_GO_DUCK_SECONDS} s in one go, never more than ${MAX_ONE_GO_SIGNS} signs`, () => {
    for (const r of rides) {
      expect(r.groups, `seed ${r.seed}`).toBeGreaterThan(10);
      expect(r.longest.seconds, `seed ${r.seed} at ${r.longest.street}`).toBeLessThanOrEqual(ONE_GO_DUCK_SECONDS);
      expect(r.mostSigns, `seed ${r.seed}`).toBeLessThanOrEqual(MAX_ONE_GO_SIGNS);
    }
  });
});
