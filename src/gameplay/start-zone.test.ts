import { describe, expect, it } from 'vitest';
import { START_ZONE } from '../core/config';
import { Game } from '../core/game';
import type { EntityKind } from '../types';
import { ZONE_LENGTH } from '../world/zones';
import { createGameplaySystem } from './index';

// START_ZONE is Bad Cannstatt: its people are Wasen visitors from the first pattern on.
describe('run start zone', () => {
  it('the gameplay route starts in START_ZONE, so the first people match its theme', () => {
    expect(START_ZONE).toBe(2);
    const game = new Game({ systems: [createGameplaySystem()] });
    game.seed(4);
    game.commands.startRun();
    // Nobody rides (no player system): never crash, so the run lasts.
    game.state.player.invulnerableTimer = Infinity;
    const kinds = new Set<EntityKind>();
    while (game.state.mode === 'playing' && game.state.distance < ZONE_LENGTH / 2) {
      game.tick();
      for (const e of game.state.entities) kinds.add(e.kind);
    }
    expect(game.state.distance).toBeGreaterThanOrEqual(ZONE_LENGTH / 2);
    expect(kinds.has('wasenGuest')).toBe(true);
    expect(kinds.has('vfbFan')).toBe(false);
  });
});
