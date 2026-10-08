import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import type { Pattern } from './patterns';
import { rideLine } from './stunt-bot';
import { planStuntLine } from './stunt-line';

function plan(seed: number, speeds: number[], zone: number): Pattern {
  const steps = planStuntLine(new Rng(seed), speeds, zone, seed);
  for (let s = steps.next(); ; s = steps.next()) if (s.done) return s.value;
}

// Acceptance (ROADMAP 27): a sloppy human (gap take-offs +-4 ticks off the
// middle of the window, the three human holds) completes >= 90 % of the
// lines it takes, at every speed and in every zone, and nothing on a line
// ever crashes it or costs health.
describe('the human stunt bot', { timeout: 120_000 }, () => {
  for (const [slow, fast] of [
    [90, 100],
    [130, 142],
    [176, 190],
  ] as const) {
    it(`completes >= 90 % of the lines planned for ${slow}-${fast} px/s, ridden at both ends of the range, without a crash`, () => {
      let rides = 0;
      let completed = 0;
      const missed: string[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const zone = seed % 3;
        const line = plan(seed, [slow, fast], zone);
        for (const speed of [slow, fast]) {
          const ride = rideLine(line, speed, seed * 31 + speed, zone);
          rides++;
          expect(ride.crashes).toBe(0);
          expect(ride.healthLost).toBe(0);
          expect(ride.end, `seed ${seed} at ${speed}: the line ends`).not.toBeNull();
          // The kicker starts the line quietly: steps from the second piece on, from x2.
          expect(ride.steps.map((s) => s.step)).toEqual(ride.steps.map((_, i) => i + 2));
          expect(ride.steps.map((s) => s.multiplier)).toEqual(ride.steps.map((_, i) => i + 2));
          if (ride.end!.completed) completed++;
          else missed.push(`seed ${seed} at ${speed}: ${ride.end!.made}/${ride.end!.steps}`);
        }
      }
      expect(completed / rides, missed.join(', ')).toBeGreaterThanOrEqual(0.9);
    });
  }
});
