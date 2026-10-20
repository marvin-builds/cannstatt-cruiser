import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { Rng } from '../core/rng';
import type { Entity } from '../types';
import { BALL_HIT_POINTS } from './ball';
import {
  CLOSE_THROW,
  FAR_THROW,
  KNOCK_LEAD_SECONDS,
  KNOCK_MOST,
  KNOCK_STAGGER_SECONDS,
  knockCount,
  landingIn,
  REACT_SECONDS,
  type Rider,
  throwForce,
} from './ball-knock';
import { CROWD_HEADS, CROWD_LEAD_SECONDS, CROWD_SPACING_SECONDS, crowdOf, crowdRow, planCrowd } from './crowd';
import { EARLY_TAKEOFF_WINDOW, HUMAN_HOLDS, LATE_TAKEOFF_WINDOW } from './fairness';
import { itemOf } from './items';
import { courseOf, type Pattern } from './patterns';
import { Solver } from './solver';
import { layPattern, quietGame, record } from './test-kit';
import { HumanBot } from './testing';

// GitHub issue #11 (ROADMAP 90): the thrown football knocks over the front of a fan crowd, more fans from close by.

const grounded: Rider = { x: PLAYER_X, y: GROUND_Y, vy: 0, grounded: true, grinding: false };

/** Screen x of `n` standing fans `gap` apart, the first `lead` px ahead of the rider. */
const row = (lead: number, n: number, gap: number) => Array.from({ length: n }, (_, i) => PLAYER_X + lead + i * gap);

describe('throwForce: how many fans a throw wants to knock over', () => {
  it(`is ${KNOCK_MOST} from close, 1 from far, and never grows with the distance flown`, () => {
    expect(throwForce(0)).toBe(KNOCK_MOST);
    expect(throwForce(CLOSE_THROW)).toBe(KNOCK_MOST);
    expect(throwForce(CLOSE_THROW + 1)).toBe(2);
    expect(throwForce(FAR_THROW)).toBe(2);
    expect(throwForce(FAR_THROW + 1)).toBe(1);
    expect(throwForce(1000)).toBe(1);
    let last = KNOCK_MOST;
    for (let flown = 0; flown <= 400; flown++) {
      expect(throwForce(flown)).toBeLessThanOrEqual(last);
      last = throwForce(flown);
    }
  });
});

describe('landingIn: seconds until a rider is on the ground again (worst case: holding on)', () => {
  it('is 0 on the ground, longer the higher and faster up the rider is', () => {
    expect(landingIn(grounded)).toBe(0);
    const falling = landingIn({ ...grounded, grounded: false, y: GROUND_Y - 20, vy: 50 });
    const rising = landingIn({ ...grounded, grounded: false, y: GROUND_Y - 20, vy: -200 });
    expect(falling).toBeGreaterThan(0);
    expect(rising).toBeGreaterThan(falling);
    expect(rising).toBeLessThan(2);
  });
});

describe('knockCount: as many fans as the throw wants, as long as the rest stays fair', () => {
  const speed = 150;
  const gap = Math.round(CROWD_SPACING_SECONDS * speed);
  const need = (REACT_SECONDS + KNOCK_LEAD_SECONDS) * speed;

  it('knocks what the throw wants when the first head left standing is far enough ahead', () => {
    for (const want of [1, 2, 3]) {
      const fronts = row(Math.ceil(need) - want * gap, 6, gap);
      expect(knockCount(want, fronts, grounded, speed)).toBe(want);
    }
  });

  it('knocks more (up to the most) when that leaves the fair run-up, and nobody when nothing does', () => {
    // One would leave the second head too close; two leave the third far enough ahead.
    expect(knockCount(1, row(Math.ceil(need) - 2 * gap, 6, gap), grounded, speed)).toBe(2);
    expect(knockCount(1, row(Math.ceil(need) - KNOCK_MOST * gap, 6, gap), grounded, speed)).toBe(KNOCK_MOST);
    // Too close for any count: the crowd stays as planned (it was fair before the throw).
    expect(knockCount(3, row(Math.floor(need) - KNOCK_MOST * gap - 1, 6, gap), grounded, speed)).toBe(0);
  });

  it('knocks the whole rest of a crowd when no more than the count stands', () => {
    expect(knockCount(3, row(10, 3, gap), grounded, speed)).toBe(3);
    expect(knockCount(2, row(10, 1, gap), grounded, speed)).toBe(1);
  });

  it('in the air: counts from the worst-case landing; on a rail: nobody', () => {
    const air: Rider = { ...grounded, grounded: false, y: GROUND_Y - 25, vy: -150 };
    const late = (REACT_SECONDS + KNOCK_LEAD_SECONDS) * speed;
    const landing = (Math.max(REACT_SECONDS, landingIn(air)) + KNOCK_LEAD_SECONDS) * speed;
    expect(landing).toBeGreaterThan(late);
    const fronts = row(Math.ceil(late) - gap, 6, gap);
    expect(knockCount(1, fronts, grounded, speed)).toBe(1);
    expect(knockCount(1, fronts, air, speed)).not.toBe(1);
    expect(knockCount(1, row(Math.ceil(landing) - gap, 6, gap), air, speed)).toBe(1);
    expect(knockCount(1, row(Math.ceil(landing) - 2 * gap, 6, gap), air, speed)).toBe(2);
    expect(knockCount(3, row(0, 6, gap), air, speed)).toBe(0);
    expect(knockCount(1, row(200, 6, gap), { ...grounded, grinding: true }, speed)).toBe(0);
  });

  // The design proof behind KNOCK_LEAD_SECONDS: a crowd shortened from the front (1-5 heads left) with at least that run-up
  // to its first standing head is human-fair (early window), at every speed, up to the longest run-up a ball hit leaves.
  it('by design: 1-5 heads with a run-up of KNOCK_LEAD_SECONDS or more are fair to cross, 100-190 px/s', () => {
    const bad: string[] = [];
    for (const theme of ['vfb', 'wasen'] as const) {
      for (let v = 100; v <= 190; v += 3) {
        const gap = Math.round(CROWD_SPACING_SECONDS * v);
        for (let m = 1; m <= CROWD_HEADS.adult[1] - 1; m++) {
          const p = crowdRow({ theme, variants: [], banner: 0 }, m, gap, v);
          const planned = Math.round(CROWD_LEAD_SECONDS * v);
          for (let lead = Math.ceil(KNOCK_LEAD_SECONDS * v); lead <= 250; lead += 2) {
            const fair = new Solver(courseOf(p, planned - lead), v, { stomps: true }).fair(HUMAN_HOLDS, EARLY_TAKEOFF_WINDOW);
            if (!fair) bad.push(`${theme} ${v} px/s, ${m} heads, run-up ${lead}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

function crowdAt(speed: number, seed: number, kidMode: boolean): Pattern {
  const steps = planCrowd(new Rng(seed), [speed], { kidMode, window: LATE_TAKEOFF_WINDOW });
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value!;
  }
}

/** A quiet game at `speed` with the football in hand and the crowd's first fan `first` px ahead of the skater. */
function scene(pattern: Pattern, speed: number, kidMode: boolean, first: number): { game: Game; fans: Entity[] } {
  const game = quietGame(speed);
  game.state.kidMode = kidMode;
  game.state.carriedItem = 'football';
  const firstX = pattern.pieces.find((p) => crowdOf(p))!.x;
  const fans = layPattern(game, pattern, game.state.player.x + first - firstX).filter((e) => crowdOf(e));
  return { game, fans };
}

const fallen = (fans: Entity[]) => fans.filter((f) => typeof f.data?.stompedAt === 'number');

/** Throws at once from the scene and lets the ball and the domino play out (nothing pressed). */
function throwStill(pattern: Pattern, speed: number, first: number, kidMode = false) {
  const { game, fans } = scene(pattern, speed, kidMode, first);
  const hits = record(game, 'ballHit');
  const cleared = record(game, 'obstacleCleared');
  const backs = record(game, 'ballBack');
  const frames: number[] = [];
  game.bus.on('ballHit', () => frames.push(game.state.frame));
  game.commands.useItem();
  game.tick();
  const ball = game.state.entities.find((e) => e.kind === 'ball')!;
  // Until the ball is down and every fan due has fallen (before the skater rides into the rest).
  for (let i = 0; i < 90 && !ball.done; i++) game.tick();
  for (let i = 0; i <= KNOCK_MOST * Math.round(KNOCK_STAGGER_SECONDS / TICK_DT); i++) game.tick();
  return { game, fans, hits, cleared, backs, frames };
}

/** The farthest first-fan distance (px, at the throw) at which the ball still reaches the crowd. */
function farthestHit(pattern: Pattern, speed: number): number {
  for (let first = 400; first > 0; first -= 2) if (throwStill(pattern, speed, first).hits.length > 0) return first;
  throw new Error('the ball never reaches the crowd');
}

const SPEEDS = [100, 125, 160, 190];

describe('the ball at a fan crowd in the real game', () => {
  for (const speed of SPEEDS) {
    it(`knocks over the front fans: more from close than from far, at least the first (${speed} px/s)`, () => {
      const pattern = crowdAt(speed, 2, false);
      const far = throwStill(pattern, speed, farthestHit(pattern, speed));
      const close = throwStill(pattern, speed, Math.round(0.3 * speed));
      expect(fallen(far.fans).length).toBeGreaterThanOrEqual(1);
      expect(fallen(close.fans).length).toBeGreaterThan(fallen(far.fans).length);
      expect(fallen(close.fans).length).toBeLessThanOrEqual(KNOCK_MOST);
      for (const run of [far, close]) {
        // The front of the row, the rest stands; a crowd hit never ricochets.
        const n = fallen(run.fans).length;
        run.fans.forEach((f, i) => expect(f.done, `fan ${i}`).toBe(i < n));
        expect(run.backs).toEqual([]);
      }
    }, 60_000);
  }

  it('the fans fall front to back with a short stagger, each scored and emitted like a single hit', () => {
    const speed = 150;
    const run = throwStill(crowdAt(speed, 2, false), speed, Math.round(0.3 * speed));
    const down = fallen(run.fans);
    expect(down.length).toBe(KNOCK_MOST);
    expect(run.hits).toEqual(down.map((f) => ({ entityId: f.id, kind: f.kind })));
    const stagger = Math.round(KNOCK_STAGGER_SECONDS / TICK_DT);
    for (let i = 1; i < run.frames.length; i++) expect(run.frames[i]! - run.frames[i - 1]!).toBe(stagger);
    for (let i = 1; i < down.length; i++) expect(down[i]!.data!.stompedAt as number).toBeGreaterThan(down[i - 1]!.data!.stompedAt as number);
    expect(run.cleared).toEqual(down.map((f) => ({ entityId: f.id, kind: f.kind, points: BALL_HIT_POINTS })));
  });

  it('a ball flying over the heads is caught by the front fan: only the front of the row ever falls, never a hole', () => {
    const speed = 150;
    const pattern = crowdAt(speed, 2, false);
    for (let delay = 0; delay <= 30; delay += 2) {
      for (const first of [60, 120, 180]) {
        const { game, fans } = scene(pattern, speed, false, first);
        const hits = record(game, 'ballHit');
        const stomps = record(game, 'stomp');
        // A full jump, the throw `delay` ticks after the take-off (high above the heads).
        game.buttons.action.press('test');
        for (let i = 0; i < delay; i++) game.tick();
        game.commands.useItem();
        // The row from the first fan the skater is not past yet.
        const behind = game.state.player.hitbox.x;
        for (let i = 0; i < 20 - delay; i++) game.tick();
        game.buttons.action.release('test');
        for (let i = 0; i < 40; i++) game.tick();
        // Fans stomped before the hit are no longer the front.
        const row = fans.filter((f) => f.x + f.w > behind && (!stomps.some((st) => st.entityId === f.id) || hits.some((h) => h.entityId === f.id)));
        const knocked = row.map((f) => hits.some((h) => h.entityId === f.id));
        const n = knocked.filter(Boolean).length;
        expect(knocked, `throw ${delay} ticks into the jump, crowd ${first} px ahead`).toEqual(row.map((_, i) => i < n));
      }
    }
  });

  it('kid mode: the same fans fall, and none of them carries beer', () => {
    const speed = 150;
    const pattern = crowdAt(speed, 4, true);
    for (const first of [Math.round(0.3 * speed), Math.round(0.6 * speed)]) {
      const adult = throwStill(pattern, speed, first, false);
      const kid = throwStill(pattern, speed, first, true);
      expect(fallen(kid.fans).map((f) => f.x)).toEqual(fallen(adult.fans).map((f) => f.x));
      expect(fallen(kid.fans).length).toBeGreaterThanOrEqual(1);
      for (const f of kid.fans) expect(itemOf(f, true)).not.toBe('beer');
    }
  });
});

/**
 * The human bot rides at the crowd and the football is thrown when the first fan is `first` px ahead (on the ground
 * or in the air, wherever the bot's plan has it then). A player who sees fans fall needs REACT_SECONDS to rethink: from
 * the first hit on, the bot's old plan is dropped (a jump in the air flies on) and a fresh bot takes over after that.
 */
function throwAndCross(pattern: Pattern, speed: number, kidMode: boolean, first: number, seed: number) {
  const { game, fans } = scene(pattern, speed, kidMode, 1.6 * speed);
  const crashes = record(game, 'crash');
  const hits = record(game, 'ballHit');
  const caught = record(game, 'itemCaught');
  const last = fans[fans.length - 1]!;
  let bot: HumanBot | null = new HumanBot(new Rng(seed * 31 + speed), true);
  let thrown = false;
  let rethinkAt = -1;
  for (let tick = 0; tick < 1200 && crashes.length === 0; tick++) {
    if (!thrown && fans[0]!.x - game.state.player.x <= first) {
      game.commands.useItem();
      thrown = true;
    }
    if (hits.length > 0 && rethinkAt < 0) {
      rethinkAt = tick + Math.round(REACT_SECONDS / TICK_DT);
      bot = null;
      game.buttons.action.release('bot');
    }
    if (tick === rethinkAt) bot = new HumanBot(new Rng(seed * 7 + speed), true);
    const move = bot?.next(game.state);
    if (move === 'press') game.buttons.action.press('bot');
    if (move === 'release') game.buttons.action.release('bot');
    game.tick();
    const p = game.state.player;
    if (p.grounded && last.x + last.w < p.hitbox.x) break;
  }
  return { crashes: crashes.length, fallen: fallen(fans).filter((f) => hits.some((h) => h.entityId === f.id)).length, caught };
}

describe('after a ball hit the rest of the crowd stays fair (human bot, ROADMAP 90)', () => {
  for (const speed of [100, 130, 160, 190]) {
    it(`no crash for throws from far to late and close, on the ground and in the air (${speed} px/s)`, () => {
      const bad: string[] = [];
      let knocked = 0;
      for (const [kidMode, seed] of [[false, 3], [false, 6], [true, 5], [true, 8]] as const) {
        const pattern = crowdAt(speed, seed, kidMode);
        const range = farthestHit(pattern, speed);
        for (let first = Math.round(0.2 * speed); first <= range; first += 4) {
          const run = throwAndCross(pattern, speed, kidMode, first, first);
          knocked += run.fallen;
          const what = `${kidMode ? 'kid' : 'adult'} crowd ${seed}, thrown ${first} px before it`;
          if (run.crashes > 0) bad.push(`${what}: crash, ${run.fallen} fell`);
          if (run.caught.some((c) => c.item === 'beer')) bad.push(`${what}: beer`);
        }
      }
      expect(bad).toEqual([]);
      expect(knocked).toBeGreaterThan(0);
    }, 180_000);
  }
});
