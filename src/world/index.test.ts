import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { createWorldSystem } from './index';
import { LIGHT_TRAFFIC } from './traffic';
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
  it('has light traffic in Bad Cannstatt and at the Neckar, dense traffic in Mitte', () => {
    const world = createWorldSystem();
    const game = new Game({ systems: [world] });
    game.seed(1);
    game.commands.startRun();
    game.tick();
    expect(world.trafficDensity()).toBe(LIGHT_TRAFFIC);
    rideTo(game, ZONE_LENGTH + 1000);
    expect(world.trafficDensity()).toBe(LIGHT_TRAFFIC);
    rideTo(game, 2 * ZONE_LENGTH + 1500);
    expect(world.trafficDensity()).toBe(1);
  });

  it('shows Bad Cannstatt (light traffic) again once back on the title', () => {
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
    expect(world.trafficDensity()).toBe(LIGHT_TRAFFIC);
  });

  it('writes the traffic density into the state each tick for other systems (audio)', () => {
    const world = createWorldSystem();
    const game = new Game({ systems: [world] });
    game.seed(1);
    game.commands.startRun();
    game.tick();
    expect(game.state.trafficDensity).toBe(LIGHT_TRAFFIC);
    rideTo(game, ZONE_LENGTH + 1000);
    expect(game.state.trafficDensity).toBe(LIGHT_TRAFFIC);
    rideTo(game, 2 * ZONE_LENGTH - 50);
    expect(game.state.trafficDensity).toBeGreaterThan(LIGHT_TRAFFIC);
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

  /** Rides `seconds` at 120 px/s from the current distance and collects the vehiclePassed events. */
  function ridePasses(game: Game, seconds: number) {
    const seen: Array<{ kind: string; front: boolean; light: boolean }> = [];
    const off = game.bus.on('vehiclePassed', (e) => seen.push({ ...e }));
    for (let t = 0; t < seconds / TICK_DT; t++) rideTo(game, game.state.distance + 120 * TICK_DT);
    off();
    return seen;
  }

  it('emits vehiclePassed for light traffic in Bad Cannstatt and at the Neckar', () => {
    const game = playing();
    const cannstatt = ridePasses(game, 15);
    expect(game.state.zoneIndex).toBe(2);
    expect(cannstatt.length).toBeGreaterThan(0);
    expect(cannstatt.every((p) => p.light)).toBe(true);
    game.state.distance = ZONE_LENGTH + 100;
    const neckar = ridePasses(game, 15);
    expect(game.state.zoneIndex).toBe(1);
    expect(neckar.length).toBeGreaterThan(0);
    expect(neckar.every((p) => p.light)).toBe(true);
  });

  it('emits vehiclePassed for the dense Mitte traffic (not light), front and back lane', () => {
    const game = playing();
    game.commands.setZone(0);
    const mitte = ridePasses(game, 15);
    expect(mitte.length).toBeGreaterThan(15);
    expect(mitte.every((p) => !p.light)).toBe(true);
    expect(new Set(mitte.map((p) => p.front))).toEqual(new Set([true, false]));
  });

  it('emits no vehiclePassed on the title or after game over (state density 0)', () => {
    const game = playing();
    game.commands.setZone(0);
    ridePasses(game, 2);
    game.commands.gameOver();
    expect(ridePasses(game, 10)).toEqual([]);
    game.commands.toTitle();
    expect(ridePasses(game, 30)).toEqual([]);
  });

  it('draws the back lane and exhaust under every entity (world layer), the front lane in the fx layer', () => {
    const world = createWorldSystem();
    expect(Object.keys(world.render ?? {}).sort()).toEqual(['background', 'fx', 'world']);
  });
});

describe('world system NorDIY park', () => {
  const plan = { start: 3000, end: 3400, pieces: [{ kind: 'container' as const, from: 3100, to: 3180, height: 40 }] };

  it('eases the traffic out over the park and back in after it', () => {
    const world = createWorldSystem();
    const game = new Game({ systems: [world] });
    game.seed(1);
    game.commands.startRun();
    game.tick();
    rideTo(game, 500);
    game.state.park = plan;
    rideTo(game, 520);
    expect(world.trafficDensity()).toBe(LIGHT_TRAFFIC);
    rideTo(game, 3200);
    expect(world.trafficDensity()).toBe(0);
    expect(game.state.trafficDensity).toBe(0);
    game.state.park = null;
    rideTo(game, 3210);
    expect(world.trafficDensity()).toBe(0);
    rideTo(game, 6000);
    expect(world.trafficDensity()).toBe(LIGHT_TRAFFIC);
  });
});
