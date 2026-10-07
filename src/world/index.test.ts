import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { createWorldSystem } from './index';
import { SEAM_GRID, ZONE_LENGTH } from './zones';

function playing(): Game {
  const game = new Game({ systems: [createWorldSystem()] });
  game.seed(1);
  game.commands.startRun();
  return game;
}

function zoneEvents(game: Game): Array<{ index: number; previous: number }> {
  const seen: Array<{ index: number; previous: number }> = [];
  game.bus.on('zoneChanged', (e) => seen.push(e));
  return seen;
}

/** Puts the run at `distance` and runs one tick. */
function rideTo(game: Game, distance: number): void {
  game.state.distance = distance;
  game.tick();
}

describe('world system zones', () => {
  it('emits zoneChanged only when the gateway reaches the player', () => {
    const game = playing();
    const seen = zoneEvents(game);
    rideTo(game, ZONE_LENGTH - 1);
    expect(game.state.zoneIndex).toBe(0);
    expect(seen).toEqual([]);
    rideTo(game, ZONE_LENGTH);
    expect(game.state.zoneIndex).toBe(1);
    expect(seen).toEqual([{ index: 1, previous: 0 }]);
    rideTo(game, ZONE_LENGTH + 100);
    expect(seen).toHaveLength(1);
  });

  it('cycles through all zones back to Stuttgart-Mitte at fixed distances', () => {
    const game = playing();
    const seen = zoneEvents(game);
    for (let k = 1; k <= 3; k++) rideTo(game, k * ZONE_LENGTH);
    expect(seen.map((e) => e.index)).toEqual([1, 2, 0]);
  });

  it('keeps its schedule through its own zone changes (no snap)', () => {
    const game = playing();
    rideTo(game, ZONE_LENGTH + 10);
    expect(game.state.zoneIndex).toBe(1);
    rideTo(game, 2 * ZONE_LENGTH);
    expect(game.state.zoneIndex).toBe(2);
  });

  it('does not advance outside a running game', () => {
    const game = new Game({ systems: [createWorldSystem()] });
    rideTo(game, ZONE_LENGTH * 2);
    expect(game.state.zoneIndex).toBe(0);
  });

  it('snaps to a zone set from outside and restarts the zone length there', () => {
    const game = playing();
    game.state.distance = 1000;
    game.commands.setZone(2);
    const next = Math.ceil((1000 + ZONE_LENGTH) / SEAM_GRID) * SEAM_GRID;
    rideTo(game, next - 1);
    expect(game.state.zoneIndex).toBe(2);
    rideTo(game, next);
    expect(game.state.zoneIndex).toBe(0);
  });

  it('starts every run in zone 0 with a fresh zone length', () => {
    const game = playing();
    rideTo(game, ZONE_LENGTH * 1.5);
    expect(game.state.zoneIndex).toBe(1);
    game.commands.gameOver();
    game.commands.startRun();
    expect(game.state.zoneIndex).toBe(0);
    rideTo(game, ZONE_LENGTH - 1);
    expect(game.state.zoneIndex).toBe(0);
  });
});
