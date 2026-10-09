import { describe, expect, it } from 'vitest';
import { PLAYER_X, TICK_DT } from '../core/config';
import type { Game } from '../core/game';
import { tick } from '../player/testing';
import type { Entity } from '../types';
import { KICKER, kickerRect, ledgeRect } from './catalogue';
import { KICKER_LIP, kickerWindow, LAUNCH_EARLY_TICKS, LAUNCH_LATE_TICKS, launchVelocityFor } from './rules';
import { place, quietGame, record } from './test-kit';
import { Rng } from '../core/rng';
import type { Pattern } from './patterns';
import { planStuntLine } from './stunt-line';
import { stepBot } from './human-run';
import { HumanBot } from './testing';

// ROADMAP 40: ramps need a jump press. A kicker launches only when jump is
// pressed in its launch window (shortly before the ramp, on it, or right
// after its lip); without a press the skater rolls over it.

const SPEED = 120;
const STEP = SPEED * TICK_DT;

let nextLine = 900;

/** A kicker `ahead` px in front of the skater's feet and a 48 px ledge where its launch comes down at SPEED. */
function kickerLedge(game: Game, ahead = 80): [Entity, Entity] {
  const line = nextLine++;
  const k = place(game, 'kicker', kickerRect(PLAYER_X + ahead));
  k.data = { line, step: 1, steps: 2, velocity: launchVelocityFor(48) };
  const ledge = place(game, 'ledge', ledgeRect(PLAYER_X + ahead + 30, 48, 90));
  ledge.data = { line, step: 2, steps: 2, zone: 0 };
  return [k, ledge];
}

/** Ticks until `done` (at most `max`). */
function until(game: Game, done: () => boolean, max = 600): void {
  for (let i = 0; i < max && !done(); i++) tick(game);
}

/** A tap: jump pressed for `hold` ticks. */
function tap(game: Game, hold = 3): void {
  game.buttons.action.press('test');
  tick(game, hold);
  game.buttons.action.release('test');
}

describe('kickerWindow', () => {
  it(`opens ${LAUNCH_EARLY_TICKS} ticks of travel before the ramp and closes ${LAUNCH_LATE_TICKS} ticks after its lip`, () => {
    const k = kickerRect(200);
    const w = kickerWindow(k, SPEED);
    expect(w.lip).toBe(200 + KICKER.w * KICKER_LIP);
    expect(w.start).toBeCloseTo(200 - LAUNCH_EARLY_TICKS * STEP, 9);
    expect(w.end).toBeCloseTo(w.lip + LAUNCH_LATE_TICKS * STEP, 9);
  });

  it('gives a human at least 16 ticks at every speed of the run (90-190 px/s)', () => {
    for (const speed of [90, 120, 140, 160, 190]) {
      const w = kickerWindow(kickerRect(0), speed);
      expect((w.end - w.start) / (speed * TICK_DT), `${speed} px/s`).toBeGreaterThanOrEqual(16);
    }
  });

  it('at a standstill it still spans the ramp up to its lip', () => {
    const w = kickerWindow(kickerRect(50), 0);
    expect([w.start, w.lip, w.end]).toEqual([50, 50 + KICKER.w * KICKER_LIP, 50 + KICKER.w * KICKER_LIP]);
  });
});

describe('kicker launch on a jump press', () => {
  it('riding over a kicker without a press never launches and never crashes; the skater rolls on', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const crashes = record(game, 'crash');
    const health = game.state.health;
    const [k] = kickerLedge(game);
    until(game, () => k.x + k.w < PLAYER_X - 40, 300);
    tick(game, 60);
    expect(launches).toEqual([]);
    expect(crashes).toEqual([]);
    expect(game.state.health).toBe(health);
    expect(game.state.player.grounded).toBe(true);
    expect(k.done).toBe(false);
  });

  const cases: [string, (k: Entity) => boolean][] = [
    // The earliest press: the ollie starts in the window's first ticks, the launch comes at the lip.
    ['early, before the ramp', (k) => kickerWindow(k, SPEED).start <= PLAYER_X - STEP],
    ['on the ramp, before the lip', (k) => k.x + 2 <= PLAYER_X],
    ['right after the lip', (k) => kickerWindow(k, SPEED).lip + 3 * STEP <= PLAYER_X],
  ];
  for (const [name, when] of cases) {
    it(`a press ${name} launches exactly once, onto the line's ledge`, () => {
      const game = quietGame(SPEED);
      const launches = record(game, 'launch');
      const grinds = record(game, 'grindStart');
      const crashes = record(game, 'crash');
      const [k, ledge] = kickerLedge(game);
      until(game, () => when(k), 300);
      tap(game);
      until(game, () => grinds.length > 0 || game.state.player.grounded, 300);
      expect(launches.map((l) => l.entityId)).toEqual([k.id]);
      expect(k.done).toBe(true);
      expect(grinds).toEqual([{ entityId: ledge.id }]);
      expect(crashes).toEqual([]);
    });
  }

  it('the launch comes at the lip at the earliest, even when the ollie started before the ramp', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const [k] = kickerLedge(game);
    until(game, () => kickerWindow(k, SPEED).start <= PLAYER_X - STEP, 300);
    tap(game);
    let at = Infinity;
    game.bus.on('launch', () => (at = PLAYER_X - kickerWindow(k, SPEED).lip));
    until(game, () => launches.length > 0, 60);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(STEP + 1e-9);
  });

  it('a press before the window is a normal ollie: no launch', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const jumps = record(game, 'jump');
    const [k] = kickerLedge(game);
    until(game, () => kickerWindow(k, SPEED).start - 12 * STEP <= PLAYER_X, 300);
    tap(game);
    until(game, () => k.x + k.w < PLAYER_X - 20, 300);
    expect(jumps).toHaveLength(1);
    expect(launches).toEqual([]);
  });

  it('a press after the window is a normal ollie: no launch', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const [k] = kickerLedge(game);
    until(game, () => kickerWindow(k, SPEED).end + 2 * STEP <= PLAYER_X, 300);
    tap(game);
    tick(game, 60);
    expect(launches).toEqual([]);
  });

  it('a skater high in the air from a jump just before the window is not launched by a press over the ramp', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const jumps = record(game, 'jump');
    const [k] = kickerLedge(game, 120);
    until(game, () => kickerWindow(k, SPEED).start - 2 * STEP <= PLAYER_X, 300);
    tap(game, 20);
    until(game, () => k.x + 2 <= PLAYER_X, 300);
    expect(game.state.player.grounded).toBe(false);
    tap(game, 1);
    until(game, () => game.state.player.grounded, 300);
    tick(game, 30);
    // The press in the air expired (no buffered ollie on the landing past the window).
    expect(jumps).toHaveLength(1);
    expect(launches).toEqual([]);
  });

  it('a kicker placed without line data launches with its default velocity on a press', () => {
    const game = quietGame(SPEED);
    const launches = record(game, 'launch');
    const k = place(game, 'kicker', kickerRect(PLAYER_X + 40));
    until(game, () => k.x + 2 <= PLAYER_X, 300);
    tap(game);
    until(game, () => launches.length > 0, 60);
    expect(launches).toEqual([{ entityId: k.id, velocity: launchVelocityFor(48) }]);
  });
});

describe('kicker launch in the live game, every tick of the window', () => {
  function plan(seed: number, speed: number): Pattern {
    const steps = planStuntLine(new Rng(seed), [speed], 0, seed);
    for (let s = steps.next(); ; s = steps.next()) if (s.done) return s.value;
  }

  for (const speed of [90, 140, 190]) {
    it(`at ${speed} px/s a tap or a full press on any tick of the first kicker's window lands on the line's first ledge`, () => {
      const pattern = plan(speed, speed);
      const [k0, l0] = pattern.pieces.filter((p) => p.kind === 'kicker' || p.kind === 'ledge');
      let presses = 0;
      for (const hold of [3, 20]) {
        for (let wait = 0; ; wait++) {
          const game = quietGame(speed);
          const grinds = record(game, 'grindStart');
          const launches = record(game, 'launch');
          const dx = PLAYER_X + 100 - k0!.x;
          const k = place(game, 'kicker', { ...k0!, x: k0!.x + dx });
          k.data = { ...k0!.data };
          const ledge = place(game, 'ledge', { ...l0!, x: l0!.x + dx });
          ledge.data = { ...l0!.data };
          const w = () => kickerWindow(k, speed);
          until(game, () => w().start <= PLAYER_X, 300);
          tick(game, wait);
          // The press tick scrolls the street on before gameplay looks: the feet must still be in the window then.
          if (PLAYER_X + speed * TICK_DT > w().end) break;
          presses++;
          tap(game, hold);
          until(game, () => grinds.length > 0 || game.state.player.grounded, 300);
          expect(launches, `hold ${hold}, ${wait} ticks into the window`).toHaveLength(1);
          expect(grinds, `hold ${hold}, ${wait} ticks into the window`).toEqual([{ entityId: ledge.id }]);
        }
      }
      expect(presses).toBeGreaterThanOrEqual(2 * 16);
    });
  }
});

describe('the human bot on a stunt line', () => {
  it('presses in the launch window of every kicker it rolls over: one launch per kicker, no crash', () => {
    for (const seed of [1, 2, 3, 4]) {
      const steps = planStuntLine(new Rng(seed), [140], 0, seed, undefined, 'hops');
      let s = steps.next();
      while (!s.done) s = steps.next();
      const game = quietGame(140);
      const launches = record(game, 'launch');
      const crashes = record(game, 'crash');
      const dx = PLAYER_X + 80 - s.value.pieces[0]!.x;
      const kickers = s.value.pieces.filter((p) => p.kind === 'kicker' || p.kind === 'ledge').map((p) => {
        const e = place(game, p.kind, { x: p.x + dx, y: p.y, w: p.w, h: p.h });
        e.data = { ...p.data };
        return e;
      }).filter((e) => e.kind === 'kicker');
      const bot = new HumanBot(new Rng(seed));
      for (let i = 0; i < 900; i++) stepBot(game, bot);
      expect(launches.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(new Set(launches.map((l) => l.entityId)).size).toBe(launches.length);
      expect(launches.every((l) => kickers.some((k) => k.id === l.entityId))).toBe(true);
      expect(crashes).toEqual([]);
    }
  });
});
