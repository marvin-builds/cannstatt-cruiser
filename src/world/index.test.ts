import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { createWorldSystem } from './index';
import { ZONE_LENGTH } from './zones';

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

describe('world system zones', () => {
  it('advances to the next zone after ZONE_LENGTH and emits zoneChanged', () => {
    const game = playing();
    const seen = zoneEvents(game);
    game.state.distance = ZONE_LENGTH - 10;
    game.tick();
    expect(game.state.zoneIndex).toBe(0);
    game.state.distance = ZONE_LENGTH;
    game.tick();
    expect(game.state.zoneIndex).toBe(1);
    expect(seen).toEqual([{ index: 1, previous: 0 }]);
  });

  it('cycles through all zones back to Stuttgart-Mitte', () => {
    const game = playing();
    const seen = zoneEvents(game);
    for (let k = 1; k <= 3; k++) {
      game.state.distance = k * ZONE_LENGTH;
      game.tick();
    }
    expect(seen.map((e) => e.index)).toEqual([1, 2, 0]);
  });

  it('does not advance outside a running game', () => {
    const game = new Game({ systems: [createWorldSystem()] });
    game.state.distance = ZONE_LENGTH * 2;
    game.tick();
    expect(game.state.zoneIndex).toBe(0);
  });

  it('restarts the zone length after setZone', () => {
    const game = playing();
    game.state.distance = 1000;
    game.commands.setZone(2);
    game.state.distance = ZONE_LENGTH + 500;
    game.tick();
    expect(game.state.zoneIndex).toBe(2);
    game.state.distance = ZONE_LENGTH + 1000;
    game.tick();
    expect(game.state.zoneIndex).toBe(0);
  });

  it('starts every run in zone 0 with a fresh zone length', () => {
    const game = playing();
    game.state.distance = ZONE_LENGTH * 1.5;
    game.tick();
    expect(game.state.zoneIndex).toBe(1);
    game.commands.gameOver();
    game.commands.startRun();
    expect(game.state.zoneIndex).toBe(0);
    game.state.distance = ZONE_LENGTH - 1;
    game.tick();
    expect(game.state.zoneIndex).toBe(0);
  });
});
