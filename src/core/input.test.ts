import { describe, expect, it } from 'vitest';
import type { InputFrame, System } from '../types';
import { Game } from './game';
import { keyDown, keyUp, PointerControls, SWIPE_DISTANCE, SWIPE_DUCK_TICKS, SWIPE_WINDOW } from './input';

/** A game with a probe system that records every tick's InputFrame. */
function setup(mode: 'title' | 'playing' = 'playing') {
  const frames: InputFrame[] = [];
  const probe: System = { name: 'probe', update: (ctx) => void frames.push(ctx.input) };
  const game = new Game({ systems: [probe] });
  if (mode === 'playing') game.commands.startRun();
  const pointers = new PointerControls(game);
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) game.tick();
    return frames[frames.length - 1]!;
  };
  const presses = () => frames.filter((f) => f.action.pressed).length;
  return { game, pointers, tick, frames, presses };
}

describe('keyboard', () => {
  for (const code of ['ArrowDown', 'KeyS']) {
    it(`${code} holds duck while down and leaves the action alone`, () => {
      const { game, tick } = setup();
      keyDown(game, code);
      expect(tick().duck).toMatchObject({ pressed: true, held: true });
      expect(tick().duck).toMatchObject({ pressed: false, held: true });
      keyUp(game, code);
      const up = tick();
      expect(up.duck).toMatchObject({ held: false, released: true });
      expect(up.action.held).toBe(false);
    });
  }

  it('still maps Space, ArrowUp and W to the action, P to pause and M to mute', () => {
    const { game, tick } = setup();
    for (const code of ['Space', 'ArrowUp', 'KeyW']) {
      keyDown(game, code);
      expect(tick().action.pressed).toBe(true);
      keyUp(game, code);
      tick();
    }
    keyDown(game, 'KeyM');
    expect(tick().mutePressed).toBe(true);
    keyDown(game, 'KeyP');
    expect(tick().pausePressed).toBe(true);
  });
});

describe('touch gestures while playing', () => {
  it('a tap still jumps: the press lands at the latest when the finger lifts', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    tick();
    pointers.up(1);
    const f = tick();
    expect(f.action).toMatchObject({ pressed: true, released: true });
    expect(frames.filter((x) => x.duck.held)).toHaveLength(0);
  });

  it('a finger that stays down becomes a held action after the short swipe window (hold = high jump)', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    tick(SWIPE_WINDOW + 1);
    expect(frames.some((f) => f.action.pressed)).toBe(true);
    expect(tick().action.held).toBe(true);
    pointers.up(1);
    expect(tick().action.released).toBe(true);
  });

  it('a swipe down ducks and does not jump', () => {
    const { pointers, tick, presses } = setup();
    pointers.down(1, 100, 100, true);
    tick();
    pointers.move(1, 101, 100 + SWIPE_DISTANCE);
    expect(tick().duck).toMatchObject({ pressed: true, held: true });
    pointers.up(1);
    tick(SWIPE_WINDOW + 5);
    expect(presses()).toBe(0);
  });

  it('a swipe duck lasts a fixed time, then releases by itself', () => {
    const { pointers, tick } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 100, 100 + SWIPE_DISTANCE + 3);
    pointers.up(1);
    expect(tick(SWIPE_DUCK_TICKS - 1).duck.held).toBe(true);
    expect(tick(2).duck.held).toBe(false);
  });

  it('the next tap ends a swipe duck when it turns into the jump', () => {
    const { pointers, tick } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 100, 110);
    pointers.up(1);
    tick(5);
    pointers.down(2, 100, 100, true);
    expect(tick().duck.held).toBe(true); // still ducked while the tap is undecided
    pointers.up(2);
    const f = tick();
    expect(f.action.pressed).toBe(true);
    expect(f.duck.held).toBe(false);
  });

  it('sideways or upward movement is no swipe down: it jumps right away', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 100 + SWIPE_DISTANCE, 102);
    expect(tick().action.pressed).toBe(true);
    pointers.up(1);
    tick();
    pointers.down(2, 100, 100, true);
    pointers.move(2, 100, 100 - SWIPE_DISTANCE);
    expect(tick().action.pressed).toBe(true);
    expect(frames.some((f) => f.duck.held)).toBe(false);
  });

  it('a small wobble below the swipe distance stays a tap', () => {
    const { pointers, tick, presses, frames } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 101, 100 + SWIPE_DISTANCE - 1);
    pointers.up(1);
    tick();
    expect(presses()).toBe(1);
    expect(frames.some((f) => f.duck.held)).toBe(false);
  });

  it('movement after the window has decided does not duck any more', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    tick(SWIPE_WINDOW + 1);
    pointers.move(1, 100, 130);
    tick();
    expect(frames.some((f) => f.duck.held)).toBe(false);
  });
});

describe('pointers without a decision delay', () => {
  it('a mouse press reaches the action on the next tick, as before', () => {
    const { pointers, tick } = setup();
    pointers.down(1, 100, 100, false);
    expect(tick().action.pressed).toBe(true);
    pointers.move(1, 100, 140);
    expect(tick().duck.held).toBe(false);
  });

  it('a touch outside of a run (title) presses at once, so starting stays instant', () => {
    const { game, pointers, tick } = setup('title');
    pointers.down(1, 100, 100, true);
    tick();
    expect(game.state.mode).toBe('playing');
  });

  it('a press on a hotspot is swallowed', () => {
    const { game, pointers, tick, presses } = setup();
    let hits = 0;
    game.ctx.addHotspot({ rect: () => ({ x: 0, y: 0, w: 20, h: 20 }), onPress: () => hits++ });
    pointers.down(1, 5, 5, true);
    pointers.up(1);
    tick(SWIPE_WINDOW + 2);
    expect(hits).toBe(1);
    expect(presses()).toBe(0);
  });

  it('a cancelled undecided touch does not jump', () => {
    const { pointers, tick, presses } = setup();
    pointers.down(1, 100, 100, true);
    pointers.cancel(1);
    tick(SWIPE_WINDOW + 2);
    expect(presses()).toBe(0);
  });

  it('releaseAll drops undecided touches and every held button', () => {
    const { game, pointers, tick, presses } = setup();
    keyDown(game, 'ArrowDown');
    pointers.down(1, 100, 100, true);
    pointers.releaseAll();
    const f = tick(SWIPE_WINDOW + 2);
    expect(presses()).toBe(0);
    expect(f.duck.held).toBe(false);
  });
});
