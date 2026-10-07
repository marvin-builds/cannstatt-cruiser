import { describe, expect, it } from 'vitest';
import { GROUND_Y, MAX_HEALTH, PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { createPlayerTestGame, tick } from '../player/testing';
import type { Entity, EntityKind, GameEvents, ObstacleKind } from '../types';
import { GRIND_POINTS, OBSTACLES, obstacleRect, railRect, starRect } from './catalogue';
import { speedAt } from './difficulty';
import { createGameplaySystem } from './index';
import { SolverBot } from './testing';

function record<K extends keyof GameEvents>(game: Game, name: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  game.bus.on(name, (e) => seen.push(e));
  return seen;
}

/** Player + gameplay with the spawner off, so tests place entities themselves. */
function quietGame(): Game {
  const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
  game.setSpeedOverride(120);
  tick(game, 2);
  return game;
}

let nextId = 5000;
function place(game: Game, kind: EntityKind, rect: { x: number; y: number; w: number; h: number }): Entity {
  const e: Entity = { id: nextId++, kind, ...rect, done: false };
  game.state.entities.push(e);
  return e;
}

function obstacle(game: Game, kind: ObstacleKind, x: number): Entity {
  return place(game, kind, obstacleRect(kind, x));
}

/** Lets the solver bot play for up to `ticks` ticks or until `done`. */
function playBot(game: Game, ticks: number, done: () => boolean = () => false): void {
  const bot = new SolverBot();
  for (let i = 0; i < ticks && game.state.mode === 'playing' && !done(); i++) {
    const move = bot.next(game.state);
    if (move === 'press') game.buttons.action.press('bot');
    if (move === 'release') game.buttons.action.release('bot');
    game.tick();
  }
}

describe('crashes and health', () => {
  it('riding into an obstacle costs one health and emits crash', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const bin = obstacle(game, 'bin', PLAYER_X + 20);
    tick(game, 30);
    expect(crashes).toEqual([{ entityId: bin.id, kind: 'bin', health: MAX_HEALTH - 1 }]);
    expect(game.state.health).toBe(MAX_HEALTH - 1);
    expect(game.state.player.state).toBe('crash');
    expect(bin.done).toBe(true);
  });

  it('ignores obstacles while the player is invulnerable, without awarding a clear', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const clears = record(game, 'obstacleCleared');
    game.state.player.invulnerableTimer = 1;
    obstacle(game, 'bin', PLAYER_X + 20);
    tick(game, 40);
    expect(crashes).toEqual([]);
    expect(clears).toEqual([]);
    expect(game.state.health).toBe(MAX_HEALTH);
  });

  it('crashing at 1 health ends the run', () => {
    const game = quietGame();
    const overs = record(game, 'gameOver');
    game.state.health = 1;
    obstacle(game, 'bench', PLAYER_X + 20);
    tick(game, 30);
    expect(game.state.health).toBe(0);
    expect(game.state.mode).toBe('gameover');
    expect(overs).toHaveLength(1);
  });

  it('breaks the combo on a crash', () => {
    const game = quietGame();
    game.state.combo = 3;
    game.state.multiplier = 3;
    obstacle(game, 'bin', PLAYER_X + 20);
    tick(game, 30);
    expect(game.state.combo).toBe(0);
    expect(game.state.multiplier).toBe(1);
  });
});

describe('scoring', () => {
  it('a clean jump over an obstacle scores its points', () => {
    const game = quietGame();
    const clears = record(game, 'obstacleCleared');
    const scores = record(game, 'scoreChanged');
    const bin = obstacle(game, 'bin', PLAYER_X + 70);
    playBot(game, 90);
    expect(game.state.health).toBe(MAX_HEALTH);
    expect(clears).toEqual([{ entityId: bin.id, kind: 'bin', points: OBSTACLES.bin.points }]);
    expect(scores[0]).toEqual({ score: OBSTACLES.bin.points, delta: OBSTACLES.bin.points, combo: 1, multiplier: 1 });
    expect(game.state.score).toBe(OBSTACLES.bin.points);
  });

  it('landing on a rail starts a grind that scores every tick', () => {
    const game = quietGame();
    const grinds = record(game, 'grindStart');
    const rail = place(game, 'handrail', railRect(PLAYER_X + 50, 22, 400));
    playBot(game, 400, () => grinds.length > 0);
    expect(grinds).toEqual([{ entityId: rail.id }]);
    expect(game.state.player.grinding).toBe(true);
    tick(game, 1);
    expect(game.state.player.state).toBe('grind');
    const before = game.state.score;
    tick(game, 10);
    expect(game.state.score - before).toBe(10 * GRIND_POINTS * game.state.multiplier);
  });

  it('chains tricks without touching the ground into a combo multiplier, reset on landing', () => {
    const game = quietGame();
    const clears = record(game, 'obstacleCleared');
    place(game, 'handrail', railRect(PLAYER_X - 20, 24, 260));
    const bench = obstacle(game, 'bench', PLAYER_X + 130);
    game.buttons.action.press('test'); // full-hold jump from under the rail lands on it
    for (let i = 0; i < 200 && clears.length === 0; i++) tick(game, 1);
    game.buttons.action.release('test');
    expect(game.state.player.grinding).toBe(true);
    // Grind start = trick 1, the bench passed below the rail = trick 2.
    expect(clears).toEqual([{ entityId: bench.id, kind: 'bench', points: OBSTACLES.bench.points * 2 }]);
    expect(game.state.combo).toBe(2);
    expect(game.state.multiplier).toBe(2);
    for (let i = 0; i < 200 && !game.state.player.grounded; i++) tick(game, 1);
    expect(game.state.combo).toBe(0);
    expect(game.state.multiplier).toBe(1);
  });

  it('collects stars just for fun (no points)', () => {
    const game = quietGame();
    const events = record(game, 'starCollected');
    const star = place(game, 'star', starRect(PLAYER_X + 12, GROUND_Y - 15));
    tick(game, 20);
    expect(events).toEqual([{ entityId: star.id, stars: 1 }]);
    expect(game.state.stars).toBe(1);
    expect(game.state.score).toBe(0);
    expect(game.state.entities).not.toContain(star);
  });
});

describe('world bookkeeping', () => {
  it('scrolls entities by speed * dt, removes them off-screen left and ignores debug rails', () => {
    const game = quietGame();
    const star = place(game, 'star', { x: 300, y: 20, w: 7, h: 7 });
    const gone = place(game, 'pipe', { x: -15, y: GROUND_Y - 10, w: 12, h: 10 });
    const debug = place(game, 'handrail', { x: 10, y: GROUND_Y - 20, w: 400, h: 20 });
    debug.data = { debugRail: true };
    tick(game, 1);
    expect(star.x).toBeCloseTo(300 - 120 * TICK_DT, 6);
    expect(game.state.entities).not.toContain(gone);
    expect(debug.x).toBe(10);
  });

  it('difficulty sets the speed from the distance unless the test hook overrides it', () => {
    const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
    game.state.distance = 12000;
    tick(game, 1);
    expect(game.state.speed).toBeCloseTo(speedAt(game.state.distance - game.state.speed * TICK_DT), 6);
    game.setSpeedOverride(150);
    tick(game, 120);
    expect(game.state.speed).toBe(150);
  });

  it('a new run starts clean and replays the same spawns for the same seed', () => {
    const game = createPlayerTestGame([createGameplaySystem()]);
    tick(game, 400);
    const first = game.state.entities.map(({ kind, x, y }) => ({ kind, x, y }));
    expect(first.length).toBeGreaterThan(0);
    game.state.score = 999;
    game.commands.gameOver();
    game.commands.startRun();
    expect(game.state.entities).toEqual([]);
    expect(game.state.score).toBe(0);
    tick(game, 400);
    expect(game.state.entities.map(({ kind, x, y }) => ({ kind, x, y }))).toEqual(first);
  });
});

describe('full runs with the spawner (seed 1)', () => {
  it('doing nothing crashes and ends the run', () => {
    const game = createPlayerTestGame([createGameplaySystem()]);
    tick(game, 60 * 60);
    expect(game.state.mode).toBe('gameover');
  });

  it('a bot jumping by the real arcs survives 90 s without a crash and scores', () => {
    const game = createPlayerTestGame([createGameplaySystem()]);
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    playBot(game, 90 * 60);
    expect(crashes).toEqual([]);
    expect(game.state.mode).toBe('playing');
    expect(game.state.score).toBeGreaterThan(1000);
    expect(grinds.length).toBeGreaterThan(0);
  }, 60_000);
});
