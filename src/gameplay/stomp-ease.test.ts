import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { Rng } from '../core/rng';
import { tick } from '../player/testing';
import { HITBOX_W } from '../player/tuning';
import type { Rect } from '../types';
import { OBSTACLES } from './catalogue';
import { RAMP_DISTANCE, SPEED_RAMP_DISTANCE, TOP_SPEED } from './difficulty';
import type { Motion } from './motion';
import { type Feet, landsOnHead, STOMP_DEPTH, stompReach } from './rules';
import { Solver } from './solver';
import { humanStomp, randomScene, rideStomping, stompWindow, tryStomp } from './stomp-bot';
import { obstacle, quietGame, record } from './test-kit';
import { courseAhead, HUMAN_STYLE, paceOf, planStomp } from './testing';

// Measured with stomp-bot.ts (12 random people, full hold, mean window in take-off ticks):
// before (feet crossing the head top this tick, body over the head box): 10.5 ticks at
// 90 px/s, 5.6 at 160 px/s; a human aiming at the head (+-4 ticks) stomped 100 % early, 65 % late.
// After (head + shoulders, reach growing with speed): 15.7 at 90 px/s, 15.5 at 160 px/s; 100 % / 100 %.
// At the 190 px/s top speed (ROADMAP 23): 15.2 ticks (min 14), human 100 %.

const still: Motion = { walk: 0, sway: 0, phase: 0 };
const head: Rect = { x: 100, y: GROUND_Y - 22, w: 6, h: 22 };
const feet = (x: number, y: number, vy: number, supported = false): Feet => ({ x, y, vy, supported });
const bodyAt = (f: Feet): Rect => ({ x: f.x - HITBOX_W / 2, y: f.y - 26, w: HITBOX_W, h: 26 });
const step = (speed: number) => speed * TICK_DT;

describe('stomp zone (rule)', () => {
  it('reaches beside the head on both sides, more at higher speed', () => {
    expect(stompReach(step(BASE_SPEED))).toBeGreaterThanOrEqual(4);
    expect(stompReach(step(TOP_SPEED))).toBeGreaterThan(stompReach(step(BASE_SPEED)));
  });

  it('a falling board within the reach beside the head stomps, on both sides', () => {
    const reach = stompReach(step(TOP_SPEED));
    for (const x of [head.x - HITBOX_W / 2 - reach + 1, head.x + head.w + HITBOX_W / 2 + reach - 1]) {
      const f = feet(x, head.y + 1, 200);
      expect(landsOnHead(f, bodyAt(f), head, step(TOP_SPEED))).toBe(true);
    }
  });

  it('a falling board in the head and shoulders band stomps, even when it did not cross the top this tick', () => {
    const f = feet(head.x + 3, head.y + STOMP_DEPTH - 1, 30);
    expect(landsOnHead(f, bodyAt(f), head, step(BASE_SPEED))).toBe(true);
  });

  it('no stomp below the shoulders, when rising, on the ground, or beyond the reach', () => {
    const s = step(TOP_SPEED);
    const low = feet(head.x + 3, head.y + STOMP_DEPTH + 1, 200);
    expect(landsOnHead(low, bodyAt(low), head, s)).toBe(false);
    const rising = feet(head.x + 3, head.y + 2, -100);
    expect(landsOnHead(rising, bodyAt(rising), head, s)).toBe(false);
    const ground = feet(head.x + 3, GROUND_Y, 0, true);
    expect(landsOnHead(ground, bodyAt(ground), head, s)).toBe(false);
    const far = feet(head.x + head.w + HITBOX_W / 2 + stompReach(s) + 1, head.y + 1, 200);
    expect(landsOnHead(far, bodyAt(far), head, s)).toBe(false);
  });
});

/** Puts the skater in the air at `height` above the ground with vertical speed `vy`. */
function airborne(game: Game, height: number, vy: number): void {
  const p = game.state.player;
  p.grounded = false;
  p.y = GROUND_Y - height;
  p.vy = vy;
}

describe('easier stomps in the game', () => {
  it('coming down slightly beside the head stomps instead of landing or crashing', () => {
    const game = quietGame(0);
    const box = OBSTACLES.vfbFan.box;
    // The person's box ends 3 px before the skater's hitbox: the board comes down just behind the head.
    obstacle(game, 'vfbFan', PLAYER_X - HITBOX_W / 2 - 3 - box.x - box.w, still);
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    airborne(game, 40, 0);
    tick(game, 40);
    expect(stomps).toHaveLength(1);
    expect(crashes).toEqual([]);
  });

  it('touching the upper body from the side while descending stomps', () => {
    const game = quietGame(TOP_SPEED);
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    // The board is 3 px below the head top and sinking slowly when the person walks into the skater.
    // Its box starts 1 px past the skater's hitbox (box.x = 4).
    obstacle(game, 'wasenGuest', PLAYER_X + HITBOX_W / 2 + 1 - OBSTACLES.wasenGuest.box.x, still);
    airborne(game, 22 - 3, 1);
    tick(game, 1);
    expect(stomps).toHaveLength(1);
    expect(crashes).toEqual([]);
  });

  it('running into a person on the ground still crashes, also at top speed', () => {
    const game = quietGame(TOP_SPEED);
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    obstacle(game, 'vfbFan', PLAYER_X + 30, still);
    tick(game, 30);
    expect(crashes.map((c) => c.kind)).toEqual(['vfbFan']);
    expect(stomps).toEqual([]);
  });
});

describe('jumping clean over a person', () => {
  it('still clears it in the air (a trick in the chain) when the board comes down beyond the reach', () => {
    const scene = { kind: 'vfbFan' as const, motion: still, anchor: PLAYER_X + 170 };
    const { from, ticks } = stompWindow(scene, TOP_SPEED, 20);
    // The first take-off after the window jumps over the person.
    const game = quietGame(TOP_SPEED);
    const person = obstacle(game, scene.kind, scene.anchor, scene.motion);
    const cleared = record(game, 'obstacleCleared');
    const stomps = record(game, 'stomp');
    const crashes = record(game, 'crash');
    let comboAtClear = -1;
    game.bus.on('obstacleCleared', () => (comboAtClear = game.state.combo));
    tick(game, from + ticks);
    game.buttons.action.press('test');
    tick(game, 20);
    game.buttons.action.release('test');
    tick(game, 60);
    expect(stomps).toEqual([]);
    expect(crashes).toEqual([]);
    expect(cleared.map((c) => c.entityId)).toEqual([person.id]);
    expect(comboAtClear).toBe(1);
  });
});

describe('stomp window and the human stomper', () => {
  const scenes = (seed: number, n: number) => {
    const rng = new Rng(seed);
    return Array.from({ length: n }, () => randomScene(rng));
  };
  const minWindow = (speed: number) => Math.min(...scenes(3, 6).map((s) => stompWindow(s, speed, 20).ticks));

  it('the stomp window (full hold) is >= 10 ticks at top speed and no smaller than at the start', () => {
    const early = minWindow(BASE_SPEED);
    const late = minWindow(TOP_SPEED);
    expect(late).toBeGreaterThanOrEqual(10);
    expect(late).toBeGreaterThanOrEqual(early - 1);
  });

  it('a human aiming at the head (+-4 ticks) stomps nearly always, early and late', () => {
    for (const speed of [BASE_SPEED, TOP_SPEED]) {
      const rng = new Rng(11);
      let ok = 0;
      const all = scenes(7, 10);
      for (const scene of all) for (let k = 0; k < 3; k++) if (humanStomp(scene, speed, 20, HUMAN_STYLE.takeoffJitter, rng)) ok++;
      expect(ok / (all.length * 3)).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe('the solver mirrors the stomp rule', () => {
  it('at top speed every take-off the stomping solver passes only by a stomp stomps in the real game, >= 10 in a row', () => {
    const scene = { kind: 'vfbFan' as const, motion: { walk: 0.09, sway: 0, phase: 0 }, anchor: PLAYER_X + 170 };
    const game = quietGame(TOP_SPEED);
    obstacle(game, scene.kind, scene.anchor, scene.motion);
    const course = courseAhead(game.state);
    const plain = new Solver(course, paceOf(game.state, true));
    const stomping = new Solver(course, paceOf(game.state, true), { stomps: true });
    const ticks: number[] = [];
    for (let t = 0; t < 120; t++) if (stomping.jumpWorks(t, 20) && !plain.jumpWorks(t, 20)) ticks.push(t);
    expect(ticks.length).toBeGreaterThanOrEqual(10);
    expect(ticks[ticks.length - 1]! - ticks[0]!).toBe(ticks.length - 1);
    for (const t of ticks) expect(tryStomp(scene, TOP_SPEED, t, 20)).toBe('stomp');
  });

  it('planStomp aims at the middle of the window: 4 ticks early or late still stomps at top speed', () => {
    const scene = { kind: 'wasenGuest' as const, motion: { walk: 0.02, sway: 2, phase: 1 }, anchor: PLAYER_X + 170 };
    const game = quietGame(TOP_SPEED);
    obstacle(game, scene.kind, scene.anchor, scene.motion);
    const plan = planStomp(game.state, true)!;
    for (const off of [-4, 0, 4]) expect(tryStomp(scene, TOP_SPEED, plan.tick + off, plan.hold)).toBe('stomp');
  });
});

describe('stomp bounces in real runs', () => {
  it('a human who stomps every person late in the run never crashes on the bounce, and mostly hits', () => {
    const from = Math.max(RAMP_DISTANCE, SPEED_RAMP_DISTANCE) + 1000;
    const runs = [1, 2, 3, 4, 5].map((seed) => rideStomping(seed, 60, from));
    expect(runs.flatMap((r) => r.bounceCrashes)).toEqual([]);
    const tries = runs.reduce((n, r) => n + r.tries, 0);
    const stomps = runs.reduce((n, r) => n + r.stomps, 0);
    expect(tries).toBeGreaterThan(5);
    expect(stomps / tries).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});
