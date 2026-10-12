import { describe, expect, it } from 'vitest';
import { tick } from '../player/testing';
import type { Entity, ObstacleKind } from '../types';
import { CROWD_KEY, type CrowdTheme } from './crowd-tag';
import { obstacle, quietGame, record } from './test-kit';
import type { Game } from '../core/game';

/** A standing row of `n` fans of `theme`, the first one's left edge at screen x `x`, 30 px apart. */
function crowd(game: Game, theme: CrowdTheme, x: number, n = 5): Entity[] {
  const kind: ObstacleKind = theme === 'vfb' ? 'vfbFan' : 'wasenGuest';
  return Array.from({ length: n }, (_, seat) => {
    const e = obstacle(game, kind, x + seat * 30, { walk: 0, sway: 0, phase: 0 });
    Object.assign(e.data!, { [CROWD_KEY]: theme, seat, seats: n, gap: 30 });
    return e;
  });
}

describe('crowdAhead (ROADMAP 76)', () => {
  it('fires once, with the theme, when the first fan of a crowd comes on screen', () => {
    const game = quietGame(120);
    const seen = record(game, 'crowdAhead');
    const width = game.display.viewWidth;
    crowd(game, 'vfb', width + 10);
    tick(game, 3);
    expect(seen).toEqual([]);
    // 120 px/s = 2 px per tick: on screen after ~6 ticks.
    tick(game, 8);
    expect(seen).toEqual([{ theme: 'vfb' }]);
    tick(game, 60);
    expect(seen).toHaveLength(1);
  });

  it('fires again for the next crowd, and for the Wasen with its theme', () => {
    const game = quietGame(120);
    const seen = record(game, 'crowdAhead');
    crowd(game, 'vfb', 200);
    tick(game, 2);
    crowd(game, 'wasen', game.display.viewWidth + 2);
    tick(game, 4);
    expect(seen).toEqual([{ theme: 'vfb' }, { theme: 'wasen' }]);
  });

  it('ignores people who are not in a crowd', () => {
    const game = quietGame(120);
    const seen = record(game, 'crowdAhead');
    obstacle(game, 'vfbFan', 200, { walk: 0, sway: 0, phase: 0 });
    tick(game, 4);
    expect(seen).toEqual([]);
  });

  it('starts over with every run', () => {
    const game = quietGame(120);
    const seen = record(game, 'crowdAhead');
    crowd(game, 'wasen', 200);
    tick(game, 2);
    game.commands.gameOver();
    game.commands.startRun();
    crowd(game, 'wasen', 200);
    tick(game, 2);
    expect(seen).toEqual([{ theme: 'wasen' }, { theme: 'wasen' }]);
  });
});
