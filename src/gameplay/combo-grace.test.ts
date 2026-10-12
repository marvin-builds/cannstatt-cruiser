import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import { COMBO_GRACE_SECONDS } from './combo-grace';
import { obstacle, quietGame } from './test-kit';

/** Ticks of the combo grace: a ground touch this long still keeps the combo. */
const GRACE_TICKS = Math.floor(COMBO_GRACE_SECONDS / TICK_DT);

/** A short hop: presses jump, releases, and runs until the wheels are back on the street (the landing tick). */
function hop(game: Game): void {
  game.buttons.action.press('test');
  tick(game, 1);
  game.buttons.action.release('test');
  for (let i = 0; i < 240 && !game.state.player.grounded; i++) tick(game, 1);
  expect(game.state.player.grounded).toBe(true);
}

function withCombo(kidMode = false): Game {
  const game = quietGame();
  game.state.kidMode = kidMode;
  game.state.combo = 3;
  game.state.multiplier = 3;
  return game;
}

describe('combo grace (ROADMAP 52 point 10)', () => {
  it('is about 0.3 s, like a short manual', () => {
    expect(COMBO_GRACE_SECONDS).toBeGreaterThanOrEqual(0.25);
    expect(COMBO_GRACE_SECONDS).toBeLessThanOrEqual(0.35);
  });

  for (const kidMode of [false, true]) {
    describe(kidMode ? 'kid mode' : 'adult mode', () => {
      it('a ground touch of up to the grace keeps the combo and the multiplier', () => {
        const game = withCombo(kidMode);
        hop(game);
        tick(game, GRACE_TICKS - 1);
        expect(game.state.combo).toBe(3);
        expect(game.state.multiplier).toBe(3);
      });

      it('staying on the street longer ends the combo', () => {
        const game = withCombo(kidMode);
        hop(game);
        tick(game, GRACE_TICKS + 1);
        expect(game.state.combo).toBe(0);
        expect(game.state.multiplier).toBe(1);
      });

      it('taking off again within the grace carries the combo into the next flight, and its landing starts a fresh grace', () => {
        const game = withCombo(kidMode);
        hop(game);
        tick(game, GRACE_TICKS - 2);
        hop(game);
        expect(game.state.combo).toBe(3);
        tick(game, GRACE_TICKS - 1);
        expect(game.state.combo).toBe(3);
        tick(game, 2);
        expect(game.state.combo).toBe(0);
      });
    });
  }

  it('a crash ends the combo at once', () => {
    const game = withCombo();
    obstacle(game, 'bin', PLAYER_X + 20);
    let ticks = 0;
    while (game.state.player.state !== 'crash' && ticks++ < 60) tick(game, 1);
    expect(game.state.player.state).toBe('crash');
    expect(game.state.combo).toBe(0);
    expect(game.state.multiplier).toBe(1);
  });

  it('a new run starts without a grace running', () => {
    const game = withCombo();
    hop(game);
    game.commands.gameOver();
    game.commands.startRun();
    game.state.combo = 2;
    game.state.multiplier = 2;
    tick(game, GRACE_TICKS + 2);
    expect(game.state.combo).toBe(2);
  });
});
