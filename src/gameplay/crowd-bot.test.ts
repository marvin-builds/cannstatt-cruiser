import { describe, expect, it } from 'vitest';
import { PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { Rng } from '../core/rng';
import type { Entity } from '../types';
import { crowdOf, planCrowd } from './crowd';
import { HUMAN_HOLDS, LATE_TAKEOFF_WINDOW } from './fairness';
import { withMotion, motionOf } from './motion';
import type { Pattern } from './patterns';
import { quietGame, record } from './test-kit';
import { HumanBot } from './testing';

// ROADMAP 76 acceptance in the real game (player + gameplay): a crowd can always be crossed by bouncing from head to
// head, by a sloppy human too, and never by a jump (or a single stomp) alone.

function crowdAt(speed: number, seed: number, kidMode: boolean): Pattern {
  const steps = planCrowd(new Rng(seed), [speed], { kidMode, window: LATE_TAKEOFF_WINDOW });
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value!;
  }
}

/** A game at a pinned speed with the crowd laid like the spawner does, its origin at the skater. */
function sceneWith(pattern: Pattern, speed: number, kidMode: boolean): { game: Game; fans: Entity[] } {
  const game = quietGame(speed);
  game.state.kidMode = kidMode;
  let id = 50_000;
  const placed = pattern.pieces.map((p) => {
    const e: Entity = { ...p, data: { ...p.data }, id: id++, x: PLAYER_X + p.x, done: false };
    const motion = motionOf(e);
    if (motion) withMotion(e, motion, e.x);
    game.state.entities.push(e);
    return e;
  });
  return { game, fans: placed.filter((e) => crowdOf(e)) };
}

/** Ticks until the skater is past the last fan and back on the ground (or crashed). */
function rideOut(game: Game, fans: Entity[], drive: () => void): { crashes: number; stomps: number } {
  const crashes = record(game, 'crash');
  const stomps = record(game, 'stomp');
  const last = fans[fans.length - 1]!;
  for (let i = 0; i < 900 && crashes.length === 0; i++) {
    drive();
    game.tick();
    const p = game.state.player;
    if (p.grounded && last.x + last.w < p.hitbox.x) break;
  }
  return { crashes: crashes.length, stomps: stomps.length };
}

const SPEEDS = [125, 150, 175, 190];

describe('fan crowd in the real game (ROADMAP 76)', () => {
  for (const speed of SPEEDS) {
    it(`a sloppy human (take-off +-4 ticks, tap / half / full) bounces across head to head (${speed} px/s, 10 crowds)`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const kidMode = seed % 2 === 0;
        const { game, fans } = sceneWith(crowdAt(speed, seed, kidMode), speed, kidMode);
        const bot = new HumanBot(new Rng(seed * 31 + speed), true);
        const run = rideOut(game, fans, () => {
          const move = bot.next(game.state);
          if (move === 'press') game.buttons.action.press('bot');
          if (move === 'release') game.buttons.action.release('bot');
        });
        expect(run.crashes, `seed ${seed}`).toBe(0);
        expect(run.stomps, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      }
    }, 120_000);

    it(`no jump gets across without bouncing on at least two heads (${speed} px/s)`, () => {
      const pattern = crowdAt(speed, 3, false);
      const first = pattern.pieces[0]!.x;
      const step = speed / 60;
      // Every take-off tick from well before the crowd to its first head, with each human hold, nothing pressed in the air.
      for (let takeoff = Math.max(0, Math.floor((first - 1.1 * speed) / step)); takeoff * step < first; takeoff++) {
        for (const hold of HUMAN_HOLDS) {
          const { game, fans } = sceneWith(pattern, speed, false);
          let tick = 0;
          const run = rideOut(game, fans, () => {
            if (tick === takeoff) game.buttons.action.press('bot');
            if (tick === takeoff + hold) game.buttons.action.release('bot');
            tick++;
          });
          expect(run.crashes > 0 || run.stomps >= 2, `take-off ${takeoff}, hold ${hold}: across with ${run.stomps} stomps`).toBe(true);
        }
      }
    }, 120_000);
  }
});
