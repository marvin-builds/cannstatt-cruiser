import { describe, expect, it } from 'vitest';
import { MAX_HEALTH, PLAYER_X } from '../core/config';
import { tick } from '../player/testing';
import { obstacle, quietGame, record } from './test-kit';

// The player draws the skater stuck head-first in the bin from the crash on, so the hit bin leaves the street.
describe('bin crash', () => {
  it('removes the hit bin in the crash tick, so it neither shows nor collides', () => {
    const game = quietGame();
    const bin = obstacle(game, 'bin', PLAYER_X + 20);
    const crashes = record(game, 'crash');
    for (let i = 0; i < 30 && crashes.length === 0; i++) tick(game, 1);
    expect(crashes).toEqual([{ entityId: bin.id, kind: 'bin', health: MAX_HEALTH - 1 }]);
    expect(game.state.entities).not.toContain(bin);
    tick(game, 200);
    expect(crashes).toHaveLength(1);
    expect(game.state.health).toBe(MAX_HEALTH - 1);
    expect(game.state.player.invulnerableTimer).toBe(0);
  });

  it('the hit bin is still in the street while crash is emitted, so the player can read its lid variant', () => {
    const game = quietGame();
    const bin = obstacle(game, 'bin', PLAYER_X + 20);
    bin.data = { variant: 2 };
    const seen: (number | string | boolean | undefined)[] = [];
    game.bus.on('crash', (e) => seen.push(game.state.entities.find((x) => x.id === e.entityId)?.data?.variant));
    tick(game, 30);
    expect(seen).toEqual([2]);
    expect(game.state.entities).not.toContain(bin);
  });

  it('other crashes leave the obstacle in the street (done, harmless)', () => {
    const game = quietGame();
    const barrier = obstacle(game, 'barrier', PLAYER_X + 20);
    const crashes = record(game, 'crash');
    tick(game, 30);
    expect(crashes).toEqual([{ entityId: barrier.id, kind: 'barrier', health: MAX_HEALTH - 1 }]);
    expect(game.state.entities).toContain(barrier);
    expect(barrier.done).toBe(true);
  });

  it('brushing a bin while invulnerable is no crash and leaves it standing', () => {
    const game = quietGame();
    game.state.player.invulnerableTimer = 5;
    const bin = obstacle(game, 'bin', PLAYER_X + 20);
    const crashes = record(game, 'crash');
    tick(game, 30);
    expect(crashes).toEqual([]);
    expect(game.state.entities).toContain(bin);
  });
});
