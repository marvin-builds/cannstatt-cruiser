import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { addRail, crash, createPlayerTestGame, jumpApex, startGrind, tick } from './testing';
import { HITBOX_H } from './tuning';

function duck(game: Game, down: boolean): void {
  if (down) game.buttons.duck.press('test');
  else game.buttons.duck.release('test');
}

function groundGame(): Game {
  const game = createPlayerTestGame();
  tick(game, 5);
  return game;
}

describe('ducking', () => {
  it('holding duck on the ground crouches low with a lower hitbox', () => {
    const game = groundGame();
    duck(game, true);
    tick(game, 1);
    const p = game.state.player;
    expect(p.state).toBe('duck');
    expect(p.grounded).toBe(true);
    expect(HITBOX_H.ducking).toBeLessThan(HITBOX_H.standing - 6);
    expect(p.hitbox).toMatchObject({ y: GROUND_Y - HITBOX_H.ducking, h: HITBOX_H.ducking });
    tick(game, 30);
    expect(game.state.player.state).toBe('duck');
  });

  it('releasing duck stands up again', () => {
    const game = groundGame();
    duck(game, true);
    tick(game, 10);
    duck(game, false);
    tick(game, 1);
    expect(game.state.player.state).not.toBe('duck');
    expect(game.state.player.hitbox.h).toBe(HITBOX_H.standing);
  });

  it('pressing jump while ducked stands up and jumps as high as usual', () => {
    const plain = jumpApex(groundGame(), 2);
    const game = groundGame();
    duck(game, true);
    tick(game, 10);
    let jumps = 0;
    game.bus.on('jump', () => jumps++);
    const apex = jumpApex(game, 2);
    expect(jumps).toBe(1);
    expect(apex).toBeCloseTo(plain, 6);
  });

  it('does nothing in the air (no fast fall), but ducks right on landing while held', () => {
    const game = groundGame();
    const ys: number[] = [];
    game.buttons.action.press('test');
    tick(game, 1);
    game.buttons.action.release('test');
    duck(game, true);
    for (let i = 0; i < 60 && !game.state.player.grounded; i++) {
      expect(game.state.player.state).not.toBe('duck');
      expect(game.state.player.hitbox.h).toBe(HITBOX_H.tucked);
      ys.push(game.state.player.y);
      tick(game, 1);
    }
    const apex = jumpApex(groundGame(), 1);
    expect(GROUND_Y - Math.min(...ys)).toBeCloseTo(apex, 0);
    expect(game.state.player.state).toBe('duck');
    expect(game.state.player.hitbox.h).toBe(HITBOX_H.ducking);
  });

  it('does nothing on a rail', () => {
    const game = groundGame();
    const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 30, w: 200, h: 4 });
    startGrind(game, rail);
    duck(game, true);
    tick(game, 5);
    expect(game.state.player.state).toBe('grind');
    expect(game.state.player.hitbox.h).toBe(HITBOX_H.standing);
  });

  it('does not duck while crashing', () => {
    const game = groundGame();
    crash(game);
    duck(game, true);
    tick(game, 10);
    expect(game.state.player.state).toBe('crash');
  });

  it('a new run starts standing', () => {
    const game = groundGame();
    duck(game, true);
    tick(game, 3);
    game.commands.gameOver();
    duck(game, false);
    game.commands.startRun();
    tick(game, 1);
    expect(game.state.player.state).not.toBe('duck');
  });
});
