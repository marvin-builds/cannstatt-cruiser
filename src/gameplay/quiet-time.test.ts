import { beforeAll, describe, expect, it } from 'vitest';
import { TICK_DT } from '../core/config';
import { MIN_STRETCH, QuietMeter, type QuietReport, rideQuiet } from './quiet-time';

describe('quiet meter', () => {
  /** Feeds `pattern` (one char per tick: '#' busy, '.' quiet, '~' an effect is on) from run time 0. */
  function measure(pattern: string, from = 0): QuietReport {
    const meter = new QuietMeter(from);
    [...pattern].forEach((c, i) => meter.add((i + 1) * TICK_DT, c === '#', c !== '~'));
    return meter.report();
  }
  const ticks = (seconds: number) => Math.round(seconds / TICK_DT);

  it('measures the quiet stretches between threats, per minute of their start', () => {
    const r = measure('#' + '.'.repeat(ticks(1)) + '#' + '.'.repeat(ticks(2)) + '#');
    expect(r.minutes).toHaveLength(1);
    expect(r.minutes[0]!.longest).toBeCloseTo(2, 5);
    expect(r.minutes[0]!.mean).toBeCloseTo(1.5, 5);
    expect(r.longest.seconds).toBeCloseTo(2, 5);
  });

  it('ignores short gaps inside one threat, effects and the time before `from`', () => {
    const short = '.'.repeat(ticks(MIN_STRETCH) - 1);
    expect(measure(`#${short}#`).minutes[0]!.stretches).toBe(0);
    // An effect ends the stretch: 1 s before it, 1 s after it.
    const r = measure('#' + '.'.repeat(ticks(1)) + '~'.repeat(ticks(3)) + '.'.repeat(ticks(1)) + '#');
    expect(r.longest.seconds).toBeCloseTo(1, 5);
    expect(measure('.'.repeat(ticks(5)) + '#', 4).longest.seconds).toBeCloseTo(1, 1);
  });

  it('reports a later minute by itself', () => {
    const r = measure('#' + '.'.repeat(ticks(61)) + '#' + '.'.repeat(ticks(0.5)) + '#');
    expect(r.minutes.map((m) => m.stretches)).toEqual([1, 1]);
    expect(r.minutes[1]!.longest).toBeCloseTo(0.5, 5);
  });
});

// ROADMAP 52 (Phase 1): from about 20 s on, the sober street never has more
// than about 2.5 s without something to react to (street.ts: an obstacle, a
// person, a rail or bench, a star, a kicker, the joint or the high fiver),
// also on the street under stunt lines and in the NorDIY park. 20 seeds x
// 6 min, nobody steering, from 20 s on. Longest stretch per minute (worst
// seed) / mean stretch, minutes 1-6:
//   before (2026-10-11): 4.1 3.5 2.8 2.5 2.4 2.6 s / 2.08 1.94 1.54 1.29 1.25 1.20 s
//                        (starved planning budget: up to 5.5 s)
//   after:               2.4 2.2 2.1 2.2 2.2 2.2 s / 1.49 1.48 1.29 1.15 1.23 1.11 s
//                        (starved planning budget: up to 2.3 s)
const QUIET_CAP = 2.5;
const FROM = 20;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('quiet time on the street (spawner rides, 20 seeds x 6 min)', { timeout: 120_000 }, () => {
  let rides: { seed: number; report: QuietReport }[] = [];
  beforeAll(() => {
    rides = SEEDS.map((seed) => ({ seed, report: rideQuiet(seed, 360, { from: FROM }) }));
  }, 600_000);
  const worst = (minute: number) => rides.reduce((a, b) => (b.report.minutes[minute]!.longest > a.report.minutes[minute]!.longest ? b : a));
  const mean = (minute: number) => rides.reduce((sum, r) => sum + r.report.minutes[minute]!.mean, 0) / rides.length;

  it(`from ${FROM} s on, never more than ${QUIET_CAP} s of sober street without something to react to`, () => {
    for (const { seed, report } of rides) expect(report.longest.seconds, `seed ${seed} at ${report.longest.start.toFixed(1)} s`).toBeLessThanOrEqual(QUIET_CAP);
  });

  it('pins the quiet time at 1, 3 and 6 min: longest stretch and mean stretch', () => {
    for (const [minute, meanCap] of [
      [0, 1.6],
      [2, 1.4],
      [5, 1.3],
    ] as const) {
      const w = worst(minute);
      expect(w.report.minutes[minute]!.longest, `minute ${minute + 1}, seed ${w.seed}`).toBeLessThanOrEqual(QUIET_CAP);
      expect(mean(minute), `minute ${minute + 1}`).toBeLessThanOrEqual(meanCap);
    }
  });

  it('holds while the planning budget lags behind (empty street while a plan finishes) too', () => {
    for (const seed of [1, 2, 3, 4]) {
      const report = rideQuiet(seed, 200, { from: FROM, workPerTick: 40 });
      expect(report.longest.seconds, `seed ${seed} at ${report.longest.start.toFixed(1)} s`).toBeLessThanOrEqual(QUIET_CAP);
    }
  });
});
