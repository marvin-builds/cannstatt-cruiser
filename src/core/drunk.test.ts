import { describe, expect, it } from 'vitest';
import type { InputFrame, System } from '../types';
import { DRUNK_DELAY_MAX, DRUNK_DELAY_MIN } from './config';
import { DelayedButton, drunkDelay, drunkWindow } from './drunk';
import { Game } from './game';
import { keyDown, keyUp } from './input';
import { Rng } from './rng';

const DT = 1 / 60;

/** A playing game with a probe that records every tick's InputFrame. */
function drunkGame(seed = 1, drunkTimer = 30) {
  const frames: InputFrame[] = [];
  const probe: System = { name: 'probe', update: (ctx) => void frames.push(ctx.input) };
  const game = new Game({ systems: [probe] });
  game.seed(seed);
  game.commands.startRun();
  game.state.drunkTimer = drunkTimer;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) game.tick();
  };
  /** Ticks (1-based, counted from now) at which `pick` was true. */
  const ticksWhere = (from: number, pick: (f: InputFrame) => boolean) =>
    frames.slice(from).flatMap((f, i) => (pick(f) ? [i + 1] : []));
  return { game, frames, tick, ticksWhere };
}

describe('drunk timing helpers', () => {
  it('draws every delay from DRUNK_DELAY_MIN..MAX with the given rng', () => {
    const rng = new Rng(3);
    const delays = Array.from({ length: 500 }, () => drunkDelay(rng));
    expect(Math.min(...delays)).toBe(DRUNK_DELAY_MIN);
    expect(Math.max(...delays)).toBe(DRUNK_DELAY_MAX);
  });

  it('describes every way a press held for n ticks can arrive (for the solver)', () => {
    const spread = DRUNK_DELAY_MAX - DRUNK_DELAY_MIN;
    expect(drunkWindow(10)).toEqual({
      pressMin: DRUNK_DELAY_MIN,
      pressMax: DRUNK_DELAY_MAX,
      holdMin: 10 - spread,
      holdMax: 10 + spread,
    });
    expect(drunkWindow(2).holdMin).toBe(0);
  });
});

describe('DelayedButton', () => {
  it('passes presses through at once while the delay is 0', () => {
    let frame = 0;
    const b = new DelayedButton({ frame: () => frame, delay: () => 0 });
    b.press('key');
    frame++;
    expect(b.tick(DT)).toMatchObject({ pressed: true, held: true });
  });

  it('keeps press and release in order per source even when the release draws a shorter delay', () => {
    let frame = 0;
    const delays = [6, 3];
    const b = new DelayedButton({ frame: () => frame, delay: () => delays.shift() ?? 0 });
    b.press('key');
    b.release('key');
    const seen = [];
    for (let i = 0; i < 8; i++) {
      frame++;
      seen.push(b.tick(DT));
    }
    expect(seen.findIndex((s) => s.pressed)).toBe(6);
    expect(seen[6]).toMatchObject({ pressed: true, released: true, held: false });
  });
});

describe('drunk input in the game', () => {
  it('delivers an action press DRUNK_DELAY_MIN..MAX ticks late, and never drops it', () => {
    const { game, tick, ticksWhere, frames } = drunkGame();
    for (let i = 0; i < 40; i++) {
      const from = frames.length;
      game.buttons.action.press('test');
      tick(3);
      game.buttons.action.release('test');
      tick(DRUNK_DELAY_MAX + 4);
      const pressed = ticksWhere(from, (f) => f.action.pressed);
      expect(pressed).toHaveLength(1);
      expect(pressed[0]! - 1).toBeGreaterThanOrEqual(DRUNK_DELAY_MIN);
      expect(pressed[0]! - 1).toBeLessThanOrEqual(DRUNK_DELAY_MAX);
      const released = ticksWhere(from, (f) => f.action.released);
      expect(released).toHaveLength(1);
      expect(released[0]!).toBeGreaterThanOrEqual(pressed[0]!); // same tick = the hold shrank to a tap
    }
  });

  it('delays duck too, but not pause, mute or use', () => {
    const { game, tick, frames } = drunkGame();
    keyDown(game, 'ArrowDown');
    keyDown(game, 'KeyE');
    keyDown(game, 'KeyM');
    tick();
    expect(frames[0]!.duck.pressed).toBe(false);
    expect(frames[0]!.use.pressed).toBe(true);
    expect(frames[0]!.mutePressed).toBe(true);
    tick(DRUNK_DELAY_MAX);
    expect(frames.some((f) => f.duck.pressed)).toBe(true);
  });

  it('is deterministic for a run seed and differs between seeds', () => {
    const delaysFor = (seed: number) => {
      const { game, tick, ticksWhere, frames } = drunkGame(seed);
      const out: number[] = [];
      for (let i = 0; i < 12; i++) {
        const from = frames.length;
        keyDown(game, 'Space');
        tick();
        keyUp(game, 'Space');
        tick(DRUNK_DELAY_MAX + 2);
        out.push(ticksWhere(from, (f) => f.action.pressed)[0]!);
      }
      return out;
    };
    expect(delaysFor(7)).toEqual(delaysFor(7));
    expect(delaysFor(7)).not.toEqual(delaysFor(8));
  });

  it('does not touch the gameplay rng', () => {
    const sober = new Game({ systems: [] });
    sober.seed(4);
    sober.commands.startRun();
    const { game, tick } = drunkGame(4);
    game.buttons.action.press('test');
    tick(DRUNK_DELAY_MAX + 1);
    expect(game.rng.next()).toBe(sober.rng.next());
  });

  it('answers at once while sober', () => {
    const { game, tick, frames } = drunkGame(1, 0);
    game.buttons.action.press('test');
    tick();
    expect(frames[0]!.action.pressed).toBe(true);
  });

  it('never lets a sober release overtake a press queued while drunk', () => {
    const { game, tick, frames } = drunkGame();
    game.buttons.action.press('test');
    tick();
    game.state.drunkTimer = 0;
    game.buttons.action.release('test');
    tick(DRUNK_DELAY_MAX + 2);
    const pressedAt = frames.findIndex((f) => f.action.pressed);
    const releasedAt = frames.findIndex((f) => f.action.released);
    expect(pressedAt).toBeGreaterThanOrEqual(DRUNK_DELAY_MIN);
    expect(releasedAt).toBe(pressedAt);
  });

  it('releases everything at once on focus loss, dropping queued edges', () => {
    const { game, tick, frames } = drunkGame();
    game.buttons.action.press('test');
    tick();
    game.buttons.action.releaseAll();
    tick(DRUNK_DELAY_MAX + 2);
    expect(frames.some((f) => f.action.pressed || f.action.held)).toBe(false);
  });

  it('only applies while playing', () => {
    const { game, tick, frames } = drunkGame();
    game.commands.pause();
    game.buttons.duck.press('test');
    tick();
    expect(frames.at(-1)!.duck.pressed).toBe(true);
  });
});
