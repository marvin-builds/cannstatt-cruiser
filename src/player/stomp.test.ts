import { describe, expect, it } from 'vitest';
import { GROUND_Y, TICK_DT } from '../core/config';
import { EventBus } from '../core/events';
import { createInitialState } from '../core/state';
import type { Game } from '../core/game';
import type { GameEvents } from '../types';
import { SkaterController } from './controller';
import { crash, createPlayerTestGame, tick } from './testing';
import { CATCH_TIME, GRAVITY, STOMP_BOUNCE_VELOCITY } from './tuning';

/** What gameplay does when the falling board lands on a person's head. */
function stomp(game: Game): void {
  game.bus.emit('stomp', { entityId: 7, kind: 'vfbFan', item: 'pretzel' });
}

/** A run with the player falling (after a tap jump passed its apex). */
function fallingGame(): Game {
  const game = createPlayerTestGame();
  game.buttons.action.press('test');
  tick(game, 2);
  game.buttons.action.release('test');
  for (let i = 0; i < 60 && game.state.player.vy <= 0; i++) tick(game);
  expect(game.state.player.vy).toBeGreaterThan(0);
  expect(game.state.player.grounded).toBe(false);
  return game;
}

describe('stomp bounce', () => {
  it('does not change the velocity in the tick the stomp arrives (gameplay runs after the player)', () => {
    const game = fallingGame();
    const { vy, y } = game.state.player;
    stomp(game);
    expect(game.state.player.vy).toBe(vy);
    expect(game.state.player.y).toBe(y);
  });

  it('takes off on the next tick with -STOMP_BOUNCE_VELOCITY, integrated like a jump take-off', () => {
    const game = fallingGame();
    const y0 = game.state.player.y;
    stomp(game);
    tick(game);
    const vy = -STOMP_BOUNCE_VELOCITY + GRAVITY * TICK_DT;
    expect(game.state.player.vy).toBeCloseTo(vy, 9);
    expect(game.state.player.y).toBeCloseTo(y0 + vy * TICK_DT, 9);
    expect(game.state.player.grounded).toBe(false);
    expect(game.state.player.state).toBe('air');
  });

  it('uses normal gravity even while the action is held (no hold boost)', () => {
    const game = fallingGame();
    stomp(game);
    game.buttons.action.press('test');
    tick(game, 2);
    expect(game.state.player.vy).toBeCloseTo(-STOMP_BOUNCE_VELOCITY + 2 * GRAVITY * TICK_DT, 9);
  });

  it('emits no jump event and lands by the normal rules', () => {
    const game = fallingGame();
    const jumps: unknown[] = [];
    const lands: unknown[] = [];
    game.bus.on('jump', (e) => jumps.push(e));
    game.bus.on('land', (e) => lands.push(e));
    stomp(game);
    for (let i = 0; i < 120 && !game.state.player.grounded; i++) tick(game);
    expect(jumps).toHaveLength(0);
    expect(lands).toHaveLength(1);
    expect(game.state.player.y).toBe(GROUND_Y);
  });

  it('is ignored while the crash animation plays', () => {
    const game = fallingGame();
    crash(game);
    const { vy } = game.state.player;
    stomp(game);
    tick(game);
    expect(game.state.player.vy).toBeCloseTo(vy + GRAVITY * TICK_DT, 9);
  });

  it('bounces only once per stomp', () => {
    const game = fallingGame();
    stomp(game);
    tick(game, 2);
    expect(game.state.player.vy).toBeCloseTo(-STOMP_BOUNCE_VELOCITY + 2 * GRAVITY * TICK_DT, 9);
  });

  it('a pending stomp is dropped at the next run start', () => {
    const game = fallingGame();
    stomp(game);
    game.commands.gameOver();
    game.commands.startRun();
    tick(game);
    expect(game.state.player.grounded).toBe(true);
    expect(game.state.player.vy).toBe(0);
  });
});

describe('catch animation (itemCaught)', () => {
  function controller() {
    const bus = new EventBus<GameEvents>();
    const c = new SkaterController(bus);
    const state = createInitialState();
    state.mode = 'playing';
    const input = { action: idle(), duck: idle() };
    const step = (ticks: number) => {
      for (let i = 0; i < ticks; i++) c.update(state, input, TICK_DT);
    };
    return { c, state, step };
  }

  it('reaches up for about CATCH_TIME (0.2 s) after the catch', () => {
    expect(CATCH_TIME).toBeCloseTo(0.2, 5);
    const { c, state, step } = controller();
    expect(c.view(state.player).catching).toBe(false);
    c.catchItem();
    expect(c.view(state.player).catching).toBe(true);
    step(10);
    expect(c.view(state.player).catching).toBe(true);
    step(3);
    expect(c.view(state.player).catching).toBe(false);
  });

  it('a crash cuts the catch short, and a run start clears it', () => {
    const { c, state } = controller();
    c.catchItem();
    c.crash(state);
    expect(c.view(state.player).catching).toBe(false);
    const other = controller();
    other.c.catchItem();
    other.c.reset();
    expect(other.c.view(other.state.player).catching).toBe(false);
  });
});

function idle() {
  return { pressed: false, held: false, released: false, holdTime: 0 };
}
