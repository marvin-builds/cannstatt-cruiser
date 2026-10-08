/**
 * Test helpers for the player contract (see CONTRACT.md). DOM-free, so any
 * slice's Vitest tests can simulate what gameplay will do: put the player on
 * a rail, crash it, and measure jumps.
 */
import { Game } from '../core/game';
import type { Entity, EntityKind, Rect, System } from '../types';
import { createPlayerSystem } from './index';

/** A Game with the player system (plus `extra` systems after it), a fixed seed and a started run. */
export function createPlayerTestGame(extra: System[] = []): Game {
  const game = new Game({ systems: [createPlayerSystem(), ...extra] });
  game.seed(1);
  game.commands.startRun();
  return game;
}

export function tick(game: Game, ticks = 1): void {
  for (let i = 0; i < ticks; i++) game.tick();
}

let nextRailId = 1000;

/** Adds a rail entity (top edge at rect.y) like gameplay would; it does not move unless the test moves it. */
export function addRail(game: Game, rect: Rect, kind: EntityKind = 'handrail'): Entity {
  const rail: Entity = { id: nextRailId++, kind, ...rect, done: false };
  game.state.entities.push(rail);
  return rail;
}

/** What gameplay does when the player lands on a rail. */
export function startGrind(game: Game, rail: Entity): void {
  game.bus.emit('grindStart', { entityId: rail.id });
}

/** What gameplay does when the player hits an obstacle (`bin`: the head-first dive into the bin). */
export function crash(game: Game, kind: EntityKind = 'barrier'): void {
  game.state.health -= 1;
  game.bus.emit('crash', { entityId: 1, kind, health: game.state.health });
}

/**
 * Presses the action for `holdTicks` ticks (from the current state), releases
 * and runs until the player is supported again. Returns the apex height above
 * the starting y.
 */
export function jumpApex(game: Game, holdTicks: number): number {
  const startY = game.state.player.y;
  let minY = startY;
  game.buttons.action.press('test');
  for (let i = 0; i < 240; i++) {
    if (i === holdTicks) game.buttons.action.release('test');
    game.tick();
    const p = game.state.player;
    minY = Math.min(minY, p.y);
    if (i >= holdTicks && (p.grounded || p.grinding)) break;
  }
  game.buttons.action.release('test');
  return startY - minY;
}
