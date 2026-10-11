import { describe, expect, it } from 'vitest';
import { GROUND_Y, TICK_DT } from '../core/config';
import { EventBus } from '../core/events';
import { createInitialState } from '../core/state';
import type { Game } from '../core/game';
import type { GameEvents } from '../types';
import { SkaterController } from './controller';
import { crash, createPlayerTestGame, jumpApex, playerController, tick } from './testing';
import { CATCH_TIME, CHILL_JUMP_SCALE, GRAVITY, HOLD_GRAVITY, JUMP_BUFFER, JUMP_VELOCITY, STOMP_BOUNCE_VELOCITY } from './tuning';

/** Ticks of the jump buffer: a press this many ticks before the take-off tick is still buffered. */
const BUFFER_TICKS = Math.floor(JUMP_BUFFER / TICK_DT);

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
    // Pressed longer ago than the jump buffer: held, but no head jump.
    game.buttons.action.press('test');
    tick(game, BUFFER_TICKS + 1);
    expect(game.state.player.grounded).toBe(false);
    stomp(game);
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

/**
 * A head jump (ROADMAP 60): the action goes down `before` ticks before the
 * take-off tick (0: in the take-off tick itself) and is held `hold` ticks from
 * the press. Returns the apex height above the y the stomp arrived at.
 */
function headJumpApex(before: number, hold: number, chillTimer = 0): number {
  const game = fallingGame();
  game.state.chillTimer = chillTimer;
  let pressedAt = Infinity;
  const press = (i: number) => {
    game.buttons.action.press('test');
    pressedAt = i;
  };
  // Ticks run up to the stomp (gameplay emits it after the player moved), then the take-off tick and the flight.
  let y0 = 0;
  let minY = Infinity;
  for (let i = -before; i < 120; i++) {
    if (i === -before) press(i);
    if (i === pressedAt + hold) game.buttons.action.release('test');
    if (i === 0) {
      y0 = game.state.player.y;
      stomp(game);
    }
    game.tick();
    if (i < 0) continue;
    minY = Math.min(minY, game.state.player.y);
    if (game.state.player.grounded) break;
  }
  return y0 - minY;
}

/** Apex of the same press from the street (createPlayerTestGame), `chillTimer` > 0: chilled. */
function groundApex(hold: number, chillTimer = 0): number {
  const game = createPlayerTestGame();
  tick(game, 3);
  game.state.chillTimer = chillTimer;
  return jumpApex(game, hold);
}

describe('head jump (ROADMAP 60: a press turns the stomp bounce into a jump)', () => {
  it('a press in the take-off tick jumps off the head with JUMP_VELOCITY and the hold boost', () => {
    const game = fallingGame();
    const y0 = game.state.player.y;
    stomp(game);
    game.buttons.action.press('test');
    tick(game);
    const vy = -JUMP_VELOCITY + HOLD_GRAVITY * TICK_DT;
    expect(game.state.player.vy).toBeCloseTo(vy, 9);
    expect(game.state.player.y).toBeCloseTo(y0 + vy * TICK_DT, 9);
    expect(game.state.player.state).toBe('jump');
  });

  it('a press a few ticks before the stomp (within the jump buffer) is buffered into the head jump', () => {
    for (let before = 1; before <= BUFFER_TICKS; before++) {
      const game = fallingGame();
      game.buttons.action.press('test');
      tick(game, before);
      expect(game.state.player.vy, `${before} ticks before`).toBeGreaterThan(0);
      stomp(game);
      tick(game);
      expect(game.state.player.vy, `${before} ticks before`).toBeCloseTo(-JUMP_VELOCITY + HOLD_GRAVITY * TICK_DT, 9);
    }
  });

  it('a press older than the jump buffer gives the plain bounce', () => {
    const game = fallingGame();
    game.buttons.action.press('test');
    game.buttons.action.release('test');
    tick(game, BUFFER_TICKS + 1);
    expect(game.state.player.grounded).toBe(false);
    stomp(game);
    tick(game);
    expect(game.state.player.vy).toBeCloseTo(-STOMP_BOUNCE_VELOCITY + GRAVITY * TICK_DT, 9);
  });

  it('flies exactly as high above the head as the same press jumps from the street: a tap low, a long hold high', () => {
    for (const hold of [1, 3, 10, 20, 30]) expect(headJumpApex(0, hold), `${hold}-tick hold`).toBeCloseTo(groundApex(hold), 6);
    expect(headJumpApex(0, 20)).toBeGreaterThan(headJumpApex(0, 1) + 20);
  });

  it('a buffered press counts its hold from the take-off, like a buffered jump on landing', () => {
    // Released before the take-off: a tap. Held on: the hold counts from the take-off tick.
    expect(headJumpApex(3, 2)).toBeCloseTo(groundApex(1), 6);
    expect(headJumpApex(3, 23)).toBeCloseTo(groundApex(20), 6);
  });

  it('is scaled by CHILL_JUMP_SCALE while chilled, like every jump', () => {
    expect(headJumpApex(0, 20, 5)).toBeCloseTo(groundApex(20, 5), 6);
    const game = fallingGame();
    game.state.chillTimer = 5;
    stomp(game);
    game.buttons.action.press('test');
    tick(game);
    expect(game.state.player.vy).toBeCloseTo(-JUMP_VELOCITY * CHILL_JUMP_SCALE + HOLD_GRAVITY * TICK_DT, 9);
  });

  it('starts no second jump and emits no jump event (one stomp, one take-off)', () => {
    const game = fallingGame();
    const jumps: unknown[] = [];
    game.bus.on('jump', (e) => jumps.push(e));
    stomp(game);
    game.buttons.action.press('test');
    tick(game, 3);
    expect(jumps).toHaveLength(0);
    expect(game.state.player.vy).toBeCloseTo(-JUMP_VELOCITY + 3 * HOLD_GRAVITY * TICK_DT, 9);
  });

  it('a missed stomp stays a crash: a buffered press does nothing while the crash plays', () => {
    const game = fallingGame();
    game.buttons.action.press('test');
    tick(game);
    crash(game);
    const { vy } = game.state.player;
    stomp(game);
    tick(game);
    expect(game.state.player.vy).toBeCloseTo(vy + GRAVITY * TICK_DT, 9);
    expect(playerController(game).crashing).toBe(true);
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
