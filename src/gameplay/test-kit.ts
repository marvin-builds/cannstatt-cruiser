/**
 * Vitest helpers for gameplay tests: a player + gameplay game, entity
 * placement and a solver-bot driver. Not used by the game itself.
 */
import type { Game } from '../core/game';
import { createPlayerTestGame, tick } from '../player/testing';
import type { Entity, EntityKind, GameEvents, ObstacleKind, Rect } from '../types';
import { obstacleRect } from './catalogue';
import { createGameplaySystem } from './index';
import { type Motion, withMotion } from './motion';
import { SolverBot } from './testing';

export function record<K extends keyof GameEvents>(game: Game, name: K): GameEvents[K][] {
  const seen: GameEvents[K][] = [];
  game.bus.on(name, (e) => seen.push(e));
  return seen;
}

/** Player + gameplay with the spawner off and the speed pinned, so tests place entities themselves. */
export function quietGame(speed: number | null = 120): Game {
  const game = createPlayerTestGame([createGameplaySystem({ spawning: false })]);
  game.setSpeedOverride(speed);
  tick(game, 2);
  return game;
}

let nextId = 20_000;

export function place(game: Game, kind: EntityKind, rect: Rect): Entity {
  const e: Entity = { id: nextId++, kind, ...rect, done: false };
  game.state.entities.push(e);
  return e;
}

/** An obstacle with its left edge (its anchor, for people) at screen x. */
export function obstacle(game: Game, kind: ObstacleKind, x: number, motion?: Motion): Entity {
  const e = place(game, kind, obstacleRect(kind, x));
  if (motion) withMotion(e, motion, x);
  return e;
}

/** Lets the solver bot play (jumping and ducking) for up to `ticks` ticks or until `done`. */
export function playBot(game: Game, ticks: number, done: () => boolean = () => false): void {
  const bot = new SolverBot(game.ctx.speedOverride !== null);
  for (let i = 0; i < ticks && game.state.mode === 'playing' && !done(); i++) {
    const move = bot.next(game.state);
    if (move === 'press') game.buttons.action.press('bot');
    if (move === 'release') game.buttons.action.release('bot');
    if (bot.duck(game.state)) game.buttons.duck.press('bot');
    else game.buttons.duck.release('bot');
    game.tick();
  }
  game.buttons.action.release('bot');
  game.buttons.duck.release('bot');
}
