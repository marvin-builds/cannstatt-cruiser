import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Rect } from '../types';
import { addRail, createPlayerTestGame, startGrind, tick } from './testing';

/** Hitboxes tick by tick: riding, then grinding a long rail. */
function hitboxes(drunk: boolean): Rect[] {
  const game = createPlayerTestGame();
  if (drunk) game.state.drunkTimer = 60;
  const seen: Rect[] = [];
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      tick(game);
      seen.push({ ...game.state.player.hitbox });
    }
  };
  run(180);
  startGrind(game, addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 30, w: 400, h: 4 }));
  run(60);
  return seen;
}

describe('drunk sway is looks only', () => {
  it('leaves the hitbox exactly as when sober, every tick', () => {
    expect(hitboxes(true)).toEqual(hitboxes(false));
  });
});
