/**
 * Fail-rate simulation of street kickflips (ROADMAP 42): how many flips land
 * still turning by more than the bail grace (gameplay's
 * KICKFLIP_BAIL_GRACE_TICKS), sober, drunk and chilled. The flight comes from
 * the real jump physics (a test game per jump; chilled with the lower chill
 * take-off). Every case is enumerated with equal weights, so the shares are exact:
 * - overall: the flip starts on any tick canStartAirTrick allows (uniform over
 *   that window; drunk the delayed press just decides which tick that is),
 *   every jitter 0..DRUNK_FLIP_JITTER equally likely;
 * - earliest: down pressed on the first allowed tick of a full-hold jump, drunk
 *   arriving after every core input delay DRUNK_DELAY_MIN..MAX.
 */
import { describe, expect, it } from 'vitest';
import { DRUNK_DELAY_MAX, DRUNK_DELAY_MIN } from '../core/config';
import { KICKFLIP_BAIL_GRACE_TICKS } from '../gameplay/bail';
import { airTrickTicks, canStartAirTrick, type FlipMood } from './air-trick';
import { createPlayerTestGame, tick } from './testing';
import { DRUNK_FLIP_JITTER } from './tuning';

interface Point {
  y: number;
  vy: number;
}

/** Ticks the action is held: a tap, a medium and a full-hold street jump. */
const HOLDS = { tap: 2, medium: 10, full: Infinity } as const;
type Hold = keyof typeof HOLDS;

/**
 * y / vy after every flight tick of a street jump (sober physics; chilled
 * with the lower chill take-off) until the landing tick, which is the last entry.
 */
function flight(hold: number, chill: boolean): Point[] {
  const game = createPlayerTestGame();
  if (chill) game.state.chillTimer = 600;
  tick(game, 3);
  game.buttons.action.press('test');
  const points: Point[] = [];
  for (let i = 0; i < 240; i++) {
    if (i === hold) game.buttons.action.release('test');
    tick(game);
    const { y, vy, grounded } = game.state.player;
    points.push({ y, vy });
    if (grounded) break;
  }
  return points;
}

/** Flight ticks on which a down press starts a street flip. */
function window(points: Point[]): number[] {
  const landing = points.length - 1;
  return points.flatMap((p, i) => (i < landing && canStartAirTrick(p.y, p.vy, false) ? [i] : []));
}

interface Outcome {
  started: number;
  bailed: number;
}

/** Every equally likely flip length for `mood`. */
function lengths(mood: FlipMood): number[] {
  if (mood !== 'drunk') return [airTrickTicks(false, mood)];
  return Array.from({ length: DRUNK_FLIP_JITTER + 1 }, (_, j) => airTrickTicks(false, mood, j));
}

/** Every equally likely input delay of a drunk down press (none otherwise). */
function pressDelays(mood: FlipMood): number[] {
  if (mood !== 'drunk') return [0];
  return Array.from({ length: DRUNK_DELAY_MAX - DRUNK_DELAY_MIN + 1 }, (_, d) => DRUNK_DELAY_MIN + d);
}

/**
 * Started and bailed flips when down arrives on tick `press + delay` for each
 * of `presses` and `delays`. A press arriving when no flip can start any more
 * (too low, landed) starts none and is not counted.
 */
function outcome(points: Point[], mood: FlipMood, presses: number[], delays: number[]): Outcome {
  const landing = points.length - 1;
  const allowed = new Set(window(points));
  const result: Outcome = { started: 0, bailed: 0 };
  // Weight per (press, delay, length) so each press tick counts the same.
  const weight = 1 / (presses.length * delays.length * lengths(mood).length);
  for (const k of presses)
    for (const d of delays) {
      const start = k + d;
      if (!allowed.has(start)) continue;
      for (const len of lengths(mood)) {
        const flipLeft = Math.max(0, len - (landing - start));
        result.started += weight;
        if (flipLeft > KICKFLIP_BAIL_GRACE_TICKS) result.bailed += weight;
      }
    }
  return result;
}

const share = (o: Outcome) => (o.started > 0 ? o.bailed / o.started : 0);

/** Overall share for `mood`: every jump with a window counts the same. */
function overall(mood: FlipMood): { share: number; perJump: Record<Hold, number | null> } {
  const perJump = {} as Record<Hold, number | null>;
  let started = 0;
  let bailed = 0;
  for (const [name, hold] of Object.entries(HOLDS) as [Hold, number][]) {
    const points = flight(hold, mood === 'chill');
    if (window(points).length === 0) {
      perJump[name] = null;
      continue;
    }
    const o = outcome(points, mood, window(points), [0]);
    perJump[name] = share(o);
    started += 1;
    bailed += share(o);
  }
  return { share: bailed / started, perJump };
}

/** Share for a press on the first allowed tick of a full-hold jump. */
function earliestFull(mood: FlipMood): number {
  const points = flight(HOLDS.full, mood === 'chill');
  return share(outcome(points, mood, [window(points)[0]!], pressDelays(mood)));
}

const pct = (x: number | null) => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);

describe('street kickflip fail rates (ROADMAP 42)', () => {
  const results = (['sober', 'drunk', 'chill'] as const).map((mood) => ({ mood, ...overall(mood), earliest: earliestFull(mood) }));
  const by = Object.fromEntries(results.map((r) => [r.mood, r]));

  it('reports the shares', () => {
    for (const r of results)
      console.log(
        `${r.mood}: overall ${pct(r.share)} (tap ${pct(r.perJump.tap)}, medium ${pct(r.perJump.medium)}, full ${pct(r.perJump.full)}), earliest full ${pct(r.earliest)}`,
      );
  });

  it('drunk: about every second flip bails, about 1 in 5 when pressed at the first chance of a full jump', () => {
    expect(by.drunk!.share).toBeGreaterThanOrEqual(0.4);
    expect(by.drunk!.share).toBeLessThanOrEqual(0.6);
    expect(by.drunk!.earliest).toBeGreaterThanOrEqual(0.1);
    expect(by.drunk!.earliest).toBeLessThanOrEqual(0.3);
  });

  it('chilled: about 1 in 5 flips bails', () => {
    expect(by.chill!.share).toBeGreaterThanOrEqual(0.15);
    expect(by.chill!.share).toBeLessThanOrEqual(0.3);
  });

  it('sober stays the safest, and an early sober flip on a full jump never bails', () => {
    expect(by.sober!.share).toBeLessThan(by.chill!.share);
    expect(by.sober!.earliest).toBe(0);
  });
});
