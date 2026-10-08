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
  it('starts a run in Bad Cannstatt on its first tick', () => {
    const game = playing();
    const seen = zoneEvents(game);
    game.tick();
    game.tick();
    expect(game.state.zoneIndex).toBe(2);
    expect(seen).toEqual([]);
  });

  it('emits zoneChanged only when the gateway reaches the player', () => {
    const game = playing();
    game.tick();
    const seen = zoneEvents(game);
    rideTo(game, ZONE_LENGTH - 1);
    expect(game.state.zoneIndex).toBe(2);
    expect(seen).toEqual([]);
    rideTo(game, ZONE_LENGTH);
    expect(game.state.zoneIndex).toBe(1);
    expect(seen).toEqual([{ index: 1, previous: 2 }]);
    rideTo(game, ZONE_LENGTH + 100);
    expect(seen).toHaveLength(1);
  });

  it('rides Cannstatt, Neckar, Mitte, Neckar, Cannstatt at fixed distances', () => {
    const game = playing();
    game.tick();
    const seen = zoneEvents(game);
    for (let k = 1; k <= 5; k++) rideTo(game, k * ZONE_LENGTH);
    expect(seen.map((e) => e.index)).toEqual([1, 0, 1, 2, 1]);
  });

  it('keeps its schedule through its own zone changes (no snap)', () => {
    const game = playing();
    rideTo(game, ZONE_LENGTH + 10);
    expect(game.state.zoneIndex).toBe(1);
    rideTo(game, 2 * ZONE_LENGTH);
    expect(game.state.zoneIndex).toBe(0);
  });

  it('does not advance outside a running game', () => {
    const game = new Game({ systems: [createWorldSystem()] });
    rideTo(game, ZONE_LENGTH * 2);
    expect(game.state.zoneIndex).toBe(2);
  });

  it('snaps to a zone set from outside and restarts the zone length there', () => {
    const game = playing();
    game.state.distance = 1000;
    game.commands.setZone(2);
    const next = Math.ceil((1000 + ZONE_LENGTH) / SEAM_GRID) * SEAM_GRID;
    rideTo(game, next - 1);
    expect(game.state.zoneIndex).toBe(2);
    rideTo(game, next);
    expect(game.state.zoneIndex).toBe(1);
  });

  it('starts every run in Bad Cannstatt with a fresh zone length', () => {
    const game = playing();
    rideTo(game, ZONE_LENGTH * 1.5);
    expect(game.state.zoneIndex).toBe(1);
    game.commands.gameOver();
    game.commands.startRun();
    game.tick();
    expect(game.state.zoneIndex).toBe(2);
    rideTo(game, ZONE_LENGTH - 1);
    expect(game.state.zoneIndex).toBe(2);
  });
});

describe('world system traffic', () => {
  it('has no traffic in Bad Cannstatt and at the Neckar, dense traffic in Mitte', () => {
    const world = createWorldSystem();
    const game = new Game({ systems: [world] });
    game.seed(1);
    game.commands.startRun();
    game.tick();
    expect(world.trafficDensity()).toBe(0);
    rideTo(game, ZONE_LENGTH + 1000);
    expect(world.trafficDensity()).toBe(0);
    rideTo(game, 2 * ZONE_LENGTH + 1500);
    expect(world.trafficDensity()).toBe(1);
  });

  it('shows Bad Cannstatt (no traffic) again once back on the title', () => {
    const world = createWorldSystem();
    const game = new Game({ systems: [world] });
    game.commands.startRun();
    game.commands.setZone(0);
    game.tick();
    expect(world.trafficDensity()).toBe(1);
    game.commands.gameOver();
    game.tick();
    expect(world.trafficDensity()).toBe(1);
    game.commands.toTitle();
    game.tick();
    expect(world.trafficDensity()).toBe(0);
  });

  it('writes the traffic density into the state each tick for other systems (audio)', () => {
    const world = createWorldSystem();
    const game = new Game({ systems: [world] });
    game.seed(1);
    game.commands.startRun();
    game.tick();
    expect(game.state.trafficDensity).toBe(0);
    rideTo(game, ZONE_LENGTH + 1000);
    expect(game.state.trafficDensity).toBe(0);
    rideTo(game, 2 * ZONE_LENGTH - 50);
    expect(game.state.trafficDensity).toBeGreaterThan(0);
    expect(game.state.trafficDensity).toBeLessThan(1);
    expect(game.state.trafficDensity).toBe(world.trafficDensity());
    rideTo(game, 2 * ZONE_LENGTH + 1500);
    expect(game.state.trafficDensity).toBe(1);
  });

  it('keeps the state density while paused and zeroes it on game over and the title', () => {
    const game = new Game({ systems: [createWorldSystem()] });
    game.commands.startRun();
    game.commands.setZone(0);
    game.tick();
    expect(game.state.trafficDensity).toBe(1);
    game.commands.pause();
    game.tick();
    expect(game.state.trafficDensity).toBe(1);
    game.commands.resume();
    game.tick();
    game.commands.gameOver();
    game.tick();
    expect(game.state.trafficDensity).toBe(0);
    game.commands.toTitle();
    game.tick();
    expect(game.state.trafficDensity).toBe(0);
  });

  it('draws the back lane and exhaust under every entity (world layer), the front lane in the fx layer', () => {
    const world = createWorldSystem();
    expect(Object.keys(world.render ?? {}).sort()).toEqual(['background', 'fx', 'world']);
  });
});
