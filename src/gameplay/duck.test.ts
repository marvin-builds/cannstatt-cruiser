import { describe, expect, it } from 'vitest';
import { BASE_SPEED, GROUND_Y, PLAYER_X } from '../core/config';
import { TOP_SPEED } from './difficulty';
import type { Game } from '../core/game';
import { Rng } from '../core/rng';
import { createPlayerTestGame, tick } from '../player/testing';
import { HITBOX_H } from '../player/tuning';
import type { Entity, GameEvents, ObstacleKind } from '../types';
import { hitBox, isOverhead, OBSTACLES, obstacleRect, OVERHEAD_KINDS } from './catalogue';
import { createGameplaySystem } from './index';
import { planPattern } from './patterns';
import { type Course, Solver } from './solver';
import { SolverBot } from './testing';

function record<K extends keyof GameEvents>(game: Game, name: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  game.bus.on(name, (e) => seen.push(e));
  return seen;
}

function quietGame(): Game {
  const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
  game.setSpeedOverride(120);
  tick(game, 2);
  return game;
}

let nextId = 7000;
function place(game: Game, kind: ObstacleKind, x: number): Entity {
  const e: Entity = { id: nextId++, kind, ...obstacleRect(kind, x), done: false };
  game.state.entities.push(e);
  return e;
}

function overheadBox(kind: ObstacleKind, x: number) {
  return hitBox({ kind, ...obstacleRect(kind, x) });
}

function block(x: number, w: number, h: number) {
  return { x, y: GROUND_Y - h, w, h };
}

function course(obstacles: Course['obstacles'], overhead: Course['overhead']): Course {
  const goal = Math.max(0, ...[...obstacles, ...overhead].map((r) => r.x + r.w));
  return { obstacles, overhead, rails: [], goal, limit: goal + 400 };
}

describe('overhead obstacles in the catalogue', () => {
  it('has at least two hanging kinds, all with an elevation', () => {
    expect(OVERHEAD_KINDS.length).toBeGreaterThanOrEqual(2);
    for (const kind of OVERHEAD_KINDS) {
      expect(isOverhead(kind)).toBe(true);
      expect(OBSTACLES[kind].elevation).toBeGreaterThan(0);
    }
    expect(isOverhead('bin')).toBe(false);
  });

  for (const kind of ['banner', 'stopSign'] as const) {
    it(`${kind}: a ducked rider fits under it, a standing or tucked one does not, nobody jumps over it`, () => {
      const box = overheadBox(kind, 0);
      const clearance = GROUND_Y - (box.y + box.h);
      // One spare pixel on top of the solver's 1 px safety margin.
      expect(clearance).toBeGreaterThanOrEqual(HITBOX_H.ducking + 2);
      expect(clearance).toBeLessThan(HITBOX_H.tucked);
      expect(GROUND_Y - box.y).toBeGreaterThan(60);
    });
  }
});

describe('solver with ducking', () => {
  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    it(`passes a hanging banner by ducking, without a jump, at ${speed} px/s`, () => {
      const s = new Solver(course([], [overheadBox('banner', 80)]), speed);
      expect(s.solvable()).toBe(true);
      expect(s.bestJump()).toBeNull();
    });
  }

  it('cannot jump through or over a hanging sign', () => {
    const sign = overheadBox('stopSign', 80);
    const s = new Solver(course([], [sign]), BASE_SPEED);
    const step = BASE_SPEED / 60;
    // Every take-off from 20 px before the sign until under its end is still in the air there.
    for (let tick = Math.ceil((sign.x - 20) / step); tick * step < sign.x + sign.w; tick++) {
      for (const hold of [1, 6, 20]) expect(s.jumpWorks(tick, hold), `tick ${tick} hold ${hold}`).toBe(false);
    }
  });

  it('a ground obstacle right under a hanging banner is impossible (no duck + jump at once)', () => {
    const banner = overheadBox('banner', 80);
    expect(new Solver(course([block(banner.x + 6, 10, 12)], [banner]), BASE_SPEED).solvable()).toBe(false);
  });

  it('ducks under a banner and then jumps a bin behind it', () => {
    const banner = overheadBox('banner', 60);
    const s = new Solver(course([block(banner.x + banner.w + 60, 10, 18)], [banner]), BASE_SPEED);
    expect(s.solvable()).toBe(true);
    const jump = s.bestJump()!;
    expect(jump.tick * (BASE_SPEED / 60)).toBeGreaterThan(banner.x);
  });

  it('lands from a jump straight into a duck', () => {
    const bin = block(40, 10, 18);
    const s = new Solver(course([bin], [overheadBox('banner', 120)]), BASE_SPEED);
    expect(s.solvable()).toBe(true);
  });
});

describe('live overhead obstacles', () => {
  it('riding into a hanging banner standing up crashes', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const banner = place(game, 'banner', PLAYER_X + 20);
    tick(game, 40);
    expect(crashes).toEqual([expect.objectContaining({ entityId: banner.id, kind: 'banner' })]);
  });

  it('jumping into a hanging sign crashes', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    place(game, 'stopSign', PLAYER_X + 30);
    game.buttons.action.press('test');
    tick(game, 40);
    expect(crashes).toHaveLength(1);
  });

  it('ducking under it is a clean clear that scores without growing a combo on the ground', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const clears = record(game, 'obstacleCleared');
    const banner = place(game, 'banner', PLAYER_X + 20);
    game.buttons.duck.press('test');
    tick(game, 60);
    expect(crashes).toEqual([]);
    expect(clears).toEqual([{ entityId: banner.id, kind: 'banner', points: OBSTACLES.banner.points }]);
    expect(game.state.score).toBe(OBSTACLES.banner.points);
    expect(game.state.combo).toBe(0);
  });
});

describe('bot and patterns with ducking', () => {
  it('the bot ducks under a hanging sign and jumps the bin after it', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const clears = record(game, 'obstacleCleared');
    place(game, 'stopSign', PLAYER_X + 60);
    place(game, 'bin', PLAYER_X + 160);
    const bot = new SolverBot();
    for (let i = 0; i < 240; i++) {
      const move = bot.next(game.state);
      if (move === 'press') game.buttons.action.press('bot');
      if (move === 'release') game.buttons.action.release('bot');
      if (bot.duck(game.state)) game.buttons.duck.press('bot');
      else game.buttons.duck.release('bot');
      tick(game, 1);
    }
    expect(crashes).toEqual([]);
    expect(clears.map((c) => c.kind)).toEqual(['stopSign', 'bin']);
  });

  it('overhead obstacles appear from tier 1 on, never in tier 0', () => {
    const rng = new Rng(4);
    const tier0 = Array.from({ length: 100 }, () => planPattern(rng, 0, [BASE_SPEED]));
    expect(tier0.flatMap((p) => p.pieces).some((p) => isOverhead(p.kind))).toBe(false);
    const tier1 = Array.from({ length: 200 }, () => planPattern(rng, 1, [BASE_SPEED]));
    expect(tier1.flatMap((p) => p.pieces).some((p) => isOverhead(p.kind))).toBe(true);
  });
});
