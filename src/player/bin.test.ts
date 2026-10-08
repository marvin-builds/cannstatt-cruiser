import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, TICK_DT } from '../core/config';
import { EventBus } from '../core/events';
import { createInitialState } from '../core/state';
import type { EntityKind, GameEvents } from '../types';
import { B, BD } from './art';
import { BIN_ANCHOR_X, BIN_SIZE } from './bin-art';
import { BIN_FLY_TIME, BIN_LID_COUNT, binTumbleAt, type BinTumble } from './bin';
import { SkaterController } from './controller';
import { isCrashTimeline, poseAt, TIMELINES, timelineFor } from './poses';
import { crash, createPlayerTestGame, tick } from './testing';
import { BIN_POP_AT, CRASH_TIME, INVULNERABLE_TIME } from './tuning';

function idle() {
  return { pressed: false, held: false, released: false, holdTime: 0 };
}

/** A bare controller on the ground in a playing run; `step` also scrolls the street at 100 px/s. */
function controller() {
  const bus = new EventBus<GameEvents>();
  const c = new SkaterController(bus);
  const state = createInitialState();
  state.mode = 'playing';
  const input = { action: idle(), duck: idle() };
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      c.update(state, input, TICK_DT);
      state.distance += 100 * TICK_DT;
    }
  };
  step(5);
  return { c, state, step };
}

const ticksOf = (seconds: number) => Math.ceil(seconds / TICK_DT);

describe('bin crash: which crashes dive into the bin', () => {
  it('a crash into a bin plays the bin timeline, every other kind the normal crash', () => {
    const kinds: EntityKind[] = ['barrier', 'bench', 'planter', 'curbGap', 'vfbFan', 'wasenGuest', 'banner', 'stopSign'];
    for (const kind of kinds) {
      const { c, state, step } = controller();
      c.crash(state, kind, 1);
      step();
      expect(timelineFor(c.view(state.player), 0), kind).toBe('crash');
    }
    const { c, state, step } = controller();
    c.crash(state, 'bin', 1);
    step();
    expect(state.player.state).toBe('crash');
    expect(timelineFor(c.view(state.player), 0)).toBe('binCrash');
  });

  it('a crash without a kind is a normal crash', () => {
    const { c, state, step } = controller();
    c.crash(state);
    step();
    expect(timelineFor(c.view(state.player), 0)).toBe('crash');
  });

  it('counts as a crash for the overlays (no joint, item or bubble)', () => {
    expect(isCrashTimeline('binCrash')).toBe(true);
    expect(isCrashTimeline('crash')).toBe(true);
    expect(isCrashTimeline('ride')).toBe(false);
  });
});

describe('bin crash: pose sequence', () => {
  it('sits in the bin on the flat board until BIN_POP_AT, with the legs kicking', () => {
    const kicks = new Set<number>([B.binKickA, B.binKickB]);
    let changes = 0;
    let last = -1;
    for (let t = 0; t < BIN_POP_AT; t += 0.01) {
      const pose = poseAt('binCrash', t);
      expect(pose.bin, `t=${t}`).toBe(true);
      expect(pose.board).toBe(BD.flat);
      expect(pose.boardDx ?? 0).toBe(0);
      if (kicks.has(pose.body) && pose.body !== last) changes++;
      last = pose.body;
    }
    expect(poseAt('binCrash', 0).body).toBe(B.binDive);
    // Kicking: the legs switch between the two frames at least 6 times.
    expect(changes).toBeGreaterThanOrEqual(6);
  });

  it('the dive frames add up to BIN_POP_AT, and the whole sequence to CRASH_TIME', () => {
    const steps = TIMELINES.binCrash.steps;
    const beforePop = steps.filter((s) => s.bin).reduce((sum, s) => sum + s.t, 0);
    const total = steps.reduce((sum, s) => sum + s.t, 0);
    expect(beforePop).toBeCloseTo(BIN_POP_AT, 5);
    expect(total).toBeCloseTo(CRASH_TIME, 5);
  });

  it('pops out with a hop above the board, then lands back on it', () => {
    const pop = poseAt('binCrash', BIN_POP_AT + 0.001);
    expect(pop.bin ?? false).toBe(false);
    expect(pop.bodyDy ?? 0).toBeLessThan(-4);
    const end = poseAt('binCrash', CRASH_TIME - 0.01);
    expect(end.bin ?? false).toBe(false);
    expect(end.bodyDy ?? 0).toBe(0);
    expect(end.boardDx ?? 0).toBe(0);
  });
});

describe('bin crash: controller', () => {
  it('keeps rolling on the ground (no crash hop) for the whole sequence', () => {
    const { c, state, step } = controller();
    c.crash(state, 'bin', 1);
    for (let i = 0; i < ticksOf(CRASH_TIME); i++) {
      step();
      expect(state.player.grounded).toBe(true);
      expect(state.player.y).toBe(GROUND_Y);
    }
  });

  it('starts the bin tumbling at the pop and rides on blinking after ~1 s', () => {
    const { c, state, step } = controller();
    c.crash(state, 'bin', 1);
    // The animation clock starts at 0 on the first tick after the crash.
    step(ticksOf(BIN_POP_AT));
    expect(c.view(state.player).time).toBeLessThan(BIN_POP_AT);
    expect(c.bin.tumbleTime).toBe(-1);
    step(1);
    expect(c.bin.tumbleTime).toBeGreaterThanOrEqual(0);
    step(ticksOf(CRASH_TIME - BIN_POP_AT) + 1);
    expect(state.player.state).not.toBe('crash');
    expect(state.player.invulnerableTimer).toBeGreaterThan(0);
    const seen = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      step();
      seen.add(c.view(state.player).visible);
    }
    expect(seen).toEqual(new Set([true, false]));
  });

  it('the tumbling bin moves with the street and is gone once off the left edge', () => {
    const { c, state, step } = controller();
    c.crash(state, 'bin', 1);
    step(ticksOf(BIN_POP_AT) + 1);
    const out: BinTumble = { frame: 0, dx: 0, lift: 0 };
    let lastDx = Infinity;
    let ticks = 0;
    while (c.bin.tumbleTime >= 0 && ticks < 600) {
      const { dx } = c.bin.tumble(out);
      expect(dx).toBeLessThanOrEqual(lastDx);
      lastDx = dx;
      step();
      ticks++;
    }
    expect(c.bin.tumbleTime).toBe(-1);
    // Gone only once it (almost) left the screen: its right edge was within a tick's scroll of x = 0.
    const right = PLAYER_X + lastDx - BIN_ANCHOR_X + BIN_SIZE;
    expect(right).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThan(3);
  });

  it('takes the lid colour from the bin it hit, and a new run clears the bin', () => {
    const { c, state, step } = controller();
    state.entities.push({ id: 42, kind: 'bin', x: PLAYER_X, y: GROUND_Y - 18, w: 12, h: 18, done: false, data: { variant: 2 } });
    c.crash(state, 'bin', 42);
    expect(c.bin.lid).toBe(2 % BIN_LID_COUNT);
    step(ticksOf(BIN_POP_AT) + 1);
    c.reset();
    expect(c.bin.tumbleTime).toBe(-1);
    expect(c.bin.diving).toBe(false);
  });

  it('falls to the ground with the bin when hit while airborne', () => {
    const game = createPlayerTestGame();
    game.buttons.action.press('test');
    tick(game, 2);
    game.buttons.action.release('test');
    crash(game, 'bin');
    tick(game, ticksOf(CRASH_TIME));
    expect(game.state.player.y).toBe(GROUND_Y);
    expect(game.state.player.invulnerableTimer).toBeLessThan(INVULNERABLE_TIME);
  });
});

describe('bin tumble path', () => {
  const at = (t: number, scrolled = 0) => ({ ...binTumbleAt(t, scrolled, { frame: 0, dx: 0, lift: 0 }) });

  it('starts on the deck, knocked back and tipping over, flies left in a little arc and lands on its side', () => {
    // Knocked clear of the skater at once, so he never seems to stand in it.
    expect(at(0).dx).toBeLessThanOrEqual(-6);
    expect(at(0).frame).not.toBe(0);
    expect(at(0).lift).toBeGreaterThan(0);
    const mid = at(BIN_FLY_TIME / 2);
    expect(mid.dx).toBeLessThan(0);
    expect(mid.lift).toBeGreaterThan(at(0).lift);
    const landed = at(BIN_FLY_TIME + 0.01);
    expect(landed.lift).toBe(0);
    expect(landed.frame).toBe(at(BIN_FLY_TIME + 1).frame);
  });

  it('rotates through several frames while flying', () => {
    const frames = new Set<number>();
    for (let t = 0; t < BIN_FLY_TIME; t += 0.01) frames.add(at(t).frame);
    expect(frames.size).toBeGreaterThanOrEqual(3);
  });

  it('moves with the street once landed', () => {
    const t = BIN_FLY_TIME + 0.2;
    expect(at(t, 40).dx).toBe(at(t, 0).dx - 40);
  });

  it('writes into the given object (no allocation per frame)', () => {
    const out = { frame: 0, dx: 0, lift: 0 };
    expect(binTumbleAt(0.1, 0, out)).toBe(out);
  });
});
