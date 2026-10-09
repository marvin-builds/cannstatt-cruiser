import { describe, expect, it } from 'vitest';
import type { InputFrame, System } from '../types';
import { Game, type InputHotspot } from './game';
import { keyDown, keyUp, PointerControls, SWIPE_DISTANCE, SWIPE_DUCK_TICKS, SWIPE_WINDOW, USER_GESTURE_EVENTS } from './input';

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

describe('use button', () => {
  it('E presses use while held and leaves action and duck alone', () => {
    const { game, tick } = setup();
    keyDown(game, 'KeyE');
    const down = tick();
    expect(down.use).toMatchObject({ pressed: true, held: true });
    expect(down.action.held || down.duck.held).toBe(false);
    keyUp(game, 'KeyE');
    expect(tick().use.released).toBe(true);
  });
});

describe('touch gestures while playing', () => {
  it('a tap still jumps: the press lands at the latest when the finger lifts', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    tick();
    pointers.up(1);
    expect(tick().action).toMatchObject({ pressed: true, held: true });
    expect(tick().action.released).toBe(true);
    expect(frames.filter((x) => x.duck.held)).toHaveLength(0);
  });

  it('a finger that stays down becomes a held action after the short swipe window (hold = high jump)', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    tick(SWIPE_WINDOW + 1);
    expect(frames.some((f) => f.action.pressed)).toBe(true);
    expect(tick().action.held).toBe(true);
    pointers.up(1);
    expect(tick(SWIPE_WINDOW).action.held).toBe(true);
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

describe('touch hold counts from touch start', () => {
  /** Ticks with the action held during `ticks` ticks of key hold, plus enough ticks to settle. */
  function keyHeldTicks(ticks: number) {
    const { game, tick, frames } = setup();
    keyDown(game, 'Space');
    tick(ticks);
    keyUp(game, 'Space');
    tick(SWIPE_WINDOW + ticks + 2);
    return frames.filter((f) => f.action.held).length;
  }

  function touchHeldTicks(ticks: number) {
    const { pointers, tick, frames, presses } = setup();
    pointers.down(1, 100, 100, true);
    tick(ticks);
    pointers.up(1);
    tick(SWIPE_WINDOW + ticks + 2);
    expect(presses()).toBe(1);
    return frames.filter((f) => f.action.held).length;
  }

  for (const ticks of [1, 2, 3, 4, 5, 6, 8, 12, 20]) {
    it(`a finger held ${ticks} ticks holds the jump as long as a ${ticks}-tick key press`, () => {
      expect(touchHeldTicks(ticks)).toBe(ticks);
      expect(keyHeldTicks(ticks)).toBe(ticks);
    });
  }

  it('a touch decided by moving sideways also credits the ticks it was already down', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    tick(3);
    pointers.move(1, 100 + SWIPE_DISTANCE, 100);
    tick(4);
    pointers.up(1);
    tick(SWIPE_WINDOW + 4);
    expect(frames.filter((f) => f.action.held)).toHaveLength(7);
  });

  it('a new touch with the same id is not released by the old touch\'s late release', () => {
    const { pointers, tick } = setup();
    pointers.down(1, 100, 100, true);
    tick(SWIPE_WINDOW + 1);
    pointers.up(1);
    tick();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 110, 100);
    expect(tick(SWIPE_WINDOW + 2).action.held).toBe(true);
  });

  it('releaseAll also drops a touch whose release is still pending', () => {
    const { pointers, tick } = setup();
    pointers.down(1, 100, 100, true);
    tick(SWIPE_WINDOW + 1);
    pointers.up(1);
    pointers.releaseAll();
    expect(tick().action.held).toBe(false);
  });
});

describe('forgiving swipe down', () => {
  it('a swipe duck lasts about 1.2 s', () => {
    expect(SWIPE_DUCK_TICKS / 60).toBeGreaterThanOrEqual(1.1);
    expect(SWIPE_DUCK_TICKS / 60).toBeLessThanOrEqual(1.3);
  });

  it('a short swipe of 4 view px already ducks', () => {
    const { pointers, tick, presses } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 100, 104);
    pointers.up(1);
    expect(tick().duck.held).toBe(true);
    tick(SWIPE_WINDOW + 2);
    expect(presses()).toBe(0);
  });

  for (const [dx, dy] of [[3, 4], [4, 4], [-5, 5], [6, 6]] as const) {
    it(`a diagonal swipe down (${dx}, ${dy}) up to ~45 degrees from vertical ducks`, () => {
      const { pointers, tick, presses } = setup();
      pointers.down(1, 100, 100, true);
      // The finger travels in small steps, like a real swipe.
      for (let i = 1; i <= 4; i++) pointers.move(1, 100 + (dx * i) / 4, 100 + (dy * i) / 4);
      pointers.up(1);
      expect(tick().duck.held).toBe(true);
      tick(SWIPE_WINDOW + 2);
      expect(presses()).toBe(0);
    });
  }

  it('a mostly sideways move (about 60 degrees from vertical) jumps', () => {
    const { pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 106, 103);
    expect(tick().action.pressed).toBe(true);
    expect(frames.some((f) => f.duck.held)).toBe(false);
  });
});

describe('hotspots that hold and take keys', () => {
  function holdSpot(game: Game, active = () => true) {
    const log: string[] = [];
    const spot: InputHotspot = {
      rect: () => (active() ? { x: 0, y: 0, w: 20, h: 20 } : null),
      onPress: () => log.push('press'),
      onRelease: () => log.push('release'),
      onKeyDown: (code) => {
        if (code !== 'KeyK') return false;
        log.push('keydown');
        return true;
      },
      onKeyUp: (code) => log.push(`keyup:${code}`),
    };
    game.ctx.addHotspot(spot);
    return log;
  }

  it('tells a hotspot when the pointer press it took ends', () => {
    const { game, pointers, tick, presses } = setup('title');
    const log = holdSpot(game);
    pointers.down(1, 5, 5, true);
    tick(10);
    pointers.up(1);
    tick();
    expect(log).toEqual(['press', 'release']);
    expect(presses()).toBe(0);
    expect(game.state.mode).toBe('title');
  });

  it('releaseAll and cancel also end a held hotspot press', () => {
    const { game, pointers } = setup('title');
    const log = holdSpot(game);
    pointers.down(1, 5, 5, false);
    pointers.releaseAll();
    pointers.down(2, 5, 5, true);
    pointers.cancel(2);
    expect(log).toEqual(['press', 'release', 'press', 'release']);
  });

  it('routes a key to an active hotspot first and reports its release once', () => {
    const { game, tick } = setup('title');
    const log = holdSpot(game);
    keyDown(game, 'KeyK');
    keyDown(game, 'KeyK'); // auto-repeat
    keyUp(game, 'KeyK');
    expect(log).toEqual(['keydown', 'keyup:KeyK']);
    keyDown(game, 'Space'); // not taken: still starts the run
    tick();
    expect(game.state.mode).toBe('playing');
  });

  it('a swallowed key never reaches its button, also while auto-repeating', () => {
    const { game, tick, presses } = setup('title');
    const modal: InputHotspot = { rect: () => ({ x: 0, y: 0, w: 1, h: 1 }), onPress: () => {}, onKeyDown: () => true };
    game.ctx.addHotspot(modal);
    keyDown(game, 'Space');
    keyDown(game, 'Space');
    tick(2);
    expect(presses()).toBe(0);
    expect(game.state.mode).toBe('title');
  });

  it('inactive hotspots (rect null) get no keys', () => {
    const { game } = setup('title');
    const log = holdSpot(game, () => false);
    keyDown(game, 'KeyK');
    keyUp(game, 'KeyK');
    expect(log).toEqual([]);
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

describe('user gestures for audio unlock', () => {
  it('include the events that grant user activation on touch (finger up), not only pointerdown', () => {
    // Phone browsers allow audio only from a touch's end; a touch's pointerdown is no activation.
    expect(USER_GESTURE_EVENTS).toEqual(expect.arrayContaining(['keydown', 'pointerdown', 'pointerup', 'touchend']));
  });
});

describe('kickflip drag: the held jump finger moves down in the air', () => {
  /** A touch held past the swipe window (a decided, held jump), then the skater is airborne. */
  function heldJump(airborne = true) {
    const s = setup();
    s.pointers.down(1, 100, 100, true);
    s.tick(SWIPE_WINDOW + 1);
    s.game.state.player.grounded = !airborne;
    return s;
  }
  const duckPresses = (frames: InputFrame[]) => frames.filter((f) => f.duck.pressed).length;

  it('presses duck exactly once while the jump stays held; further dragging does not repeat', () => {
    const { pointers, tick, frames } = heldJump();
    const dragStart = frames.length;
    pointers.move(1, 101, 100 + SWIPE_DISTANCE);
    const f = tick();
    expect(f.duck.pressed).toBe(true);
    expect(f.action.held).toBe(true);
    pointers.move(1, 101, 100 + SWIPE_DISTANCE * 3);
    pointers.move(1, 102, 100 + SWIPE_DISTANCE * 6);
    tick(10);
    expect(duckPresses(frames)).toBe(1);
    expect(frames.slice(dragStart).every((x) => x.action.held)).toBe(true);
    pointers.up(1);
    tick(SWIPE_WINDOW); // the late press releases as late as it started
    expect(tick().action.released).toBe(true);
  });

  it('re-arms after the finger moves back up, or with a new touch', () => {
    const { game, pointers, tick, frames } = heldJump();
    pointers.move(1, 100, 100 + SWIPE_DISTANCE);
    tick(5);
    pointers.move(1, 100, 100); // back up
    pointers.move(1, 100, 100 + SWIPE_DISTANCE);
    tick(5);
    expect(duckPresses(frames)).toBe(2);
    pointers.up(1);
    tick(SWIPE_WINDOW + 2);
    game.state.player.grounded = true;
    pointers.down(2, 100, 100, true);
    tick(SWIPE_WINDOW + 1);
    game.state.player.grounded = false;
    pointers.move(2, 100, 100 + SWIPE_DISTANCE);
    tick();
    expect(duckPresses(frames)).toBe(3);
  });

  it('a sideways drag in the air is no trick', () => {
    const { pointers, tick, frames } = heldJump();
    pointers.move(1, 100 + SWIPE_DISTANCE * 2, 102);
    tick(3);
    expect(duckPresses(frames)).toBe(0);
  });

  it('the trick press releases within a few ticks, so there is no duck after landing', () => {
    const { game, pointers, tick, frames } = heldJump();
    pointers.move(1, 100, 100 + SWIPE_DISTANCE);
    tick(4);
    const start = frames.length;
    game.state.player.grounded = true;
    tick(SWIPE_DUCK_TICKS);
    expect(frames.slice(start).some((f) => f.duck.held)).toBe(false);
    expect(frames.filter((f) => f.duck.held).length).toBeLessThanOrEqual(4);
  });

  it('the same drag on the ground does nothing (no duck while the jump finger is held)', () => {
    const { pointers, tick, frames } = heldJump(false);
    pointers.move(1, 100, 100 + SWIPE_DISTANCE * 3);
    tick(5);
    expect(frames.some((f) => f.duck.held)).toBe(false);
  });

  it('a downward drift on the ground does not count once airborne; only a new drag in the air does', () => {
    const { game, pointers, tick, frames } = heldJump(false);
    pointers.move(1, 100, 100 + SWIPE_DISTANCE - 1);
    game.state.player.grounded = false;
    pointers.move(1, 100, 100 + SWIPE_DISTANCE);
    tick();
    expect(duckPresses(frames)).toBe(0);
    pointers.move(1, 100, 100 + SWIPE_DISTANCE * 2);
    tick();
    expect(duckPresses(frames)).toBe(1);
  });

  it('a second-finger swipe in the air still ducks like before', () => {
    const { pointers, tick } = heldJump();
    pointers.down(2, 200, 100, true);
    pointers.move(2, 200, 100 + SWIPE_DISTANCE);
    const f = tick();
    expect(f.duck).toMatchObject({ pressed: true, held: true });
    expect(f.action.held).toBe(true);
  });

  it('a fresh swipe down on the ground still ducks for SWIPE_DUCK_TICKS', () => {
    const { pointers, tick } = setup();
    pointers.down(1, 100, 100, true);
    pointers.move(1, 100, 100 + SWIPE_DISTANCE);
    pointers.up(1);
    expect(tick(SWIPE_DUCK_TICKS - 1).duck.held).toBe(true);
    expect(tick(2).duck.held).toBe(false);
  });

  it('a mouse drag in the air is no trick (touch only)', () => {
    const { game, pointers, tick, frames } = setup();
    pointers.down(1, 100, 100, false);
    tick();
    game.state.player.grounded = false;
    pointers.move(1, 100, 100 + SWIPE_DISTANCE * 2);
    tick(3);
    expect(duckPresses(frames)).toBe(0);
  });
});
