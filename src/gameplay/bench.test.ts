import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { tick } from '../player/testing';
import { isGrindable, OBSTACLES } from './catalogue';
import { obstacle, playBot, quietGame, record } from './test-kit';

describe('grindable bench', () => {
  it('is grindable, the other ground obstacles are not', () => {
    expect(isGrindable('bench')).toBe(true);
    expect(isGrindable('handrail')).toBe(true);
    for (const kind of ['bin', 'barrier', 'planter', 'curbGap', 'vfbFan', 'banner'] as const) expect(isGrindable(kind)).toBe(false);
  });

  for (const speed of [90, 165]) {
    it(`landing on the bench top from above grinds it like a rail at ${speed} px/s`, () => {
      const game = quietGame(speed);
      const grinds = record(game, 'grindStart');
      const crashes = record(game, 'crash');
      const clears = record(game, 'obstacleCleared');
      const bench = obstacle(game, 'bench', PLAYER_X + 70);
      playBot(game, 300, () => grinds.length > 0);
      expect(grinds).toEqual([{ entityId: bench.id }]);
      tick(game, 1);
      expect(game.state.player.grinding).toBe(true);
      expect(game.state.player.y).toBe(bench.y);
      expect(bench.y).toBe(GROUND_Y - OBSTACLES.bench.h);
      playBot(game, 120);
      expect(crashes).toEqual([]);
      // Grind landing = trick 1, the bench passed = trick 2.
      expect(clears).toEqual([{ entityId: bench.id, kind: 'bench', points: OBSTACLES.bench.points * 2 }]);
    });
  }

  it('riding into the bench front on the ground crashes', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    const bench = obstacle(game, 'bench', PLAYER_X + 20);
    tick(game, 40);
    expect(grinds).toEqual([]);
    expect(crashes).toEqual([expect.objectContaining({ entityId: bench.id, kind: 'bench' })]);
  });

  it('a low hop into the bench side crashes instead of grinding', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    obstacle(game, 'bench', PLAYER_X + 8);
    game.buttons.action.press('test');
    tick(game, 1);
    game.buttons.action.release('test');
    tick(game, 40);
    expect(grinds).toEqual([]);
    expect(crashes).toHaveLength(1);
  });
});
