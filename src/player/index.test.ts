import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import { Game } from '../core/game';
import { createPlayerSystem } from './index';

/** Presses the action for `holdTicks`, then lets the jump finish; returns the apex height. */
function jumpHeight(holdTicks: number): number {
  const game = new Game({ systems: [createPlayerSystem()] });
  game.commands.startRun();
  game.buttons.action.press('test');
  let minY = game.state.player.y;
  for (let i = 0; i < 120; i++) {
    if (i === holdTicks) game.buttons.action.release('test');
    game.tick();
    minY = Math.min(minY, game.state.player.y);
  }
  expect(game.state.player.grounded).toBe(true);
  expect(game.state.player.y).toBe(GROUND_Y);
  return GROUND_Y - minY;
}

describe('placeholder player', () => {
  it('jumps when the action is pressed while playing', () => {
    expect(jumpHeight(1)).toBeGreaterThan(10);
  });

  it('jumps higher when the action is held than when tapped', () => {
    expect(jumpHeight(30)).toBeGreaterThan(jumpHeight(1) * 1.5);
  });

  it('stays on the ground on the title screen', () => {
    const game = new Game({ systems: [createPlayerSystem()] });
    game.buttons.action.press('test');
    game.tick();
    expect(game.state.player.y).toBe(GROUND_Y);
  });
});
