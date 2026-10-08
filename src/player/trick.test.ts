import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Game } from '../core/game';
import { addRail, crash, createPlayerTestGame, startGrind, tick } from './testing';
import { HITBOX_H, TRICK_TURN_TIME } from './tuning';
import { SkaterController } from './controller';
import { EventBus } from '../core/events';
import { createInitialState } from '../core/state';
import type { GameEvents, InputFrame } from '../types';

function duck(game: Game, down: boolean): void {
  if (down) game.buttons.duck.press('test');
  else game.buttons.duck.release('test');
}

function grindingGame() {
  const game = createPlayerTestGame();
  tick(game, 5);
  const rail = addRail(game, { x: PLAYER_X - 10, y: GROUND_Y - 30, w: 200, h: 4 });
  startGrind(game, rail);
  tick(game, 2);
  return { game, rail };
}

describe('grind trick (down while grinding)', () => {
  it('holding down on a rail sets grindTrick, keeps the grind and does not duck', () => {
    const { game, rail } = grindingGame();
    const before = { ...game.state.player.hitbox };
    duck(game, true);
    tick(game, 1);
    const p = game.state.player;
    expect(p.grindTrick).toBe(true);
    expect(p.grinding).toBe(true);
    expect(p.state).toBe('grind');
    expect(p.y).toBe(rail.y);
    expect(p.hitbox).toEqual(before);
    expect(p.hitbox.h).toBe(HITBOX_H.standing);
    tick(game, 30);
    expect(game.state.player.grindTrick).toBe(true);
    expect(game.state.player.grinding).toBe(true);
  });

  it('releasing down ends the trick but not the grind', () => {
    const { game } = grindingGame();
    duck(game, true);
    tick(game, 10);
    duck(game, false);
    tick(game, 1);
    expect(game.state.player.grindTrick).toBe(false);
    expect(game.state.player.grinding).toBe(true);
  });

  it('is never set off the rail: ducking on the ground stays a duck', () => {
    const game = createPlayerTestGame();
    tick(game, 5);
    duck(game, true);
    tick(game, 3);
    expect(game.state.player.state).toBe('duck');
    expect(game.state.player.grindTrick).toBe(false);
  });

  it('ends when the rail ends, on a jump off the rail and on a crash', () => {
    const ends = grindingGame();
    duck(ends.game, true);
    tick(ends.game, 2);
    ends.rail.w = 0;
    tick(ends.game, 1);
    expect(ends.game.state.player.grinding).toBe(false);
    expect(ends.game.state.player.grindTrick).toBe(false);

    const jumps = grindingGame();
    duck(jumps.game, true);
    tick(jumps.game, 2);
    jumps.game.buttons.action.press('test');
    tick(jumps.game, 1);
    expect(jumps.game.state.player.grinding).toBe(false);
    expect(jumps.game.state.player.grindTrick).toBe(false);

    const crashes = grindingGame();
    duck(crashes.game, true);
    tick(crashes.game, 2);
    crash(crashes.game);
    expect(crashes.game.state.player.grindTrick).toBe(false);
    tick(crashes.game, 1);
    expect(crashes.game.state.player.grindTrick).toBe(false);
  });

  it('a new run starts without the trick', () => {
    const { game } = grindingGame();
    duck(game, true);
    tick(game, 2);
    game.commands.gameOver();
    duck(game, false);
    game.commands.startRun();
    expect(game.state.player.grindTrick).toBe(false);
  });

  it('turns to the front through one in-between pose and back again when it ends', () => {
    const bus = new EventBus<GameEvents>();
    const c = new SkaterController(bus);
    const state = createInitialState();
    state.mode = 'playing';
    state.entities.push({ id: 7, kind: 'handrail', x: PLAYER_X - 10, y: GROUND_Y - 30, w: 400, h: 4, done: false });
    c.startGrind(state, 7);
    const dt = 1 / 60;
    const held = { pressed: false, held: true, released: false, holdTime: 0 };
    const idle = { pressed: false, held: false, released: false, holdTime: 0 };
    const input = (down: boolean): Pick<InputFrame, 'action' | 'duck'> => ({ action: idle, duck: down ? held : idle });

    c.update(state, input(false), dt);
    expect(c.view(state.player).trick).toBeNull();
    const poses: (string | null)[] = [];
    for (let t = 0; t < 0.4; t += dt) {
      c.update(state, input(true), dt);
      poses.push(c.view(state.player).trick);
    }
    expect(poses[0]).toBe('turn');
    const turnTicks = poses.filter((x) => x === 'turn').length;
    expect(turnTicks).toBe(Math.round(TRICK_TURN_TIME / dt));
    expect(poses.at(-1)).toBe('front');
    expect(poses.indexOf('front')).toBe(turnTicks);

    const back: (string | null)[] = [];
    for (let t = 0; t < 0.3; t += dt) {
      c.update(state, input(false), dt);
      back.push(c.view(state.player).trick);
    }
    expect(back[0]).toBe('turn');
    expect(back.filter((x) => x === 'turn').length).toBe(turnTicks);
    expect(back.at(-1)).toBeNull();
    expect(state.player.grinding).toBe(true);
  });
});

