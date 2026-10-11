import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import type { ObstacleKind } from '../types';
import { hitBox, isObstacle, isRail } from './catalogue';
import { buildCourse } from './course';
import { EARLY_TAKEOFF_WINDOW, HUMAN_HOLDS, humanFair, soberFairness, solversFor } from './fairness';
import { copyBody, groundBody, hitboxOf, launchBody, stepBodyInto } from './jumpsim';
import { LINE_STREET_KINDS } from './line-street';
import { planParkLine } from './park-line';
import { type Pattern, type Piece, runoutFor } from './patterns';
import { kickerWindow, landsOnHighLedge, overlaps } from './rules';
import { planStuntLine, STUNT_SHAPES, stuntWorstLanding } from './stunt-line';
import { kickerLaunchSpeed, stepOf } from './stunt-sim';

// ROADMAP 52 (Phase 1, item 2): stunt lines and the NorDIY park put low
// obstacles on the street under their launch ledges, so skipping the line is
// no free ride. The street path clears each of them with the normal take-off
// window after rolling past its kicker; riding the line never touches one.

/** Speed ranges a line is planned for: early ramp, mid, top speed, and pinned speeds. */
const RANGES = [[90, 99], [140, 152], [181, 190], [190], [120], [90]];
const PARK_SPEEDS = [90, 120, 160, 190];
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

interface Line {
  label: string;
  pattern: Pattern;
  speeds: number[];
  park: boolean;
}

function run(steps: Generator<void, Pattern>): Pattern {
  for (let s = steps.next(); ; s = steps.next()) if (s.done) return s.value;
}

const LINES: Line[] = [
  ...SEEDS.flatMap((seed) =>
    RANGES.map((range) => {
      const speeds = [range[0]!, (range[0]! + range.at(-1)!) / 2, range.at(-1)!];
      const shape = STUNT_SHAPES[seed % STUNT_SHAPES.length]!;
      return { label: `line seed ${seed} ${range.join('-')}`, pattern: run(planStuntLine(new Rng(seed), range, seed % 3, seed, undefined, shape)), speeds, park: false };
    }),
  ),
  ...SEEDS.flatMap((seed) =>
    PARK_SPEEDS.map((speed) => ({ label: `park seed ${seed} ${speed}`, pattern: run(planParkLine(new Rng(seed), [speed], -seed)), speeds: [speed], park: true })),
  ),
];

const stuntPieces = (p: Pattern) => p.pieces.filter((x) => x.kind === 'kicker' || x.kind === 'ledge');
const streetOf = (p: Pattern) => p.pieces.filter((x) => isObstacle(x.kind));

/** The kicker before street obstacle `o`, its ledge, and the ledges before that kicker. */
function launchOf(p: Pattern, o: Piece): { kicker: Piece; ledge: Piece; earlier: Piece[] } {
  const pieces = stuntPieces(p);
  let k = pieces.length - 1;
  while (!(pieces[k]!.kind === 'kicker' && pieces[k]!.x < o.x)) k--;
  return { kicker: pieces[k]!, ledge: pieces[k + 1]!, earlier: pieces.slice(0, k).filter((x) => x.kind === 'ledge') };
}

/** Whether any launch off `kicker` onto `ledge` (a press on any tick of its window, `hold`, `phase` of a tick) touches `o`. */
function launchTouches(kicker: Piece, ledge: Piece, o: Piece, speed: number, hold: number, phase: number): boolean {
  const step = stepOf(speed);
  const w = kickerWindow(kicker, speed);
  const box = hitBox({ ...o, kind: o.kind as ObstacleKind });
  const x0 = w.start - 3 * step + phase * step;
  for (let press = 0; x0 + (press + 1) * step <= w.end; press++) {
    let b = copyBody(groundBody());
    let px = x0;
    let launched = false;
    for (let t = 0; t < 240; t++) {
      stepBodyInto(b, b, px, !launched && t === press, !launched && t >= press && t < press + hold);
      px += step;
      if (overlaps(hitboxOf(b, px), box)) return true;
      if (!launched && t >= press && px >= w.lip) {
        b = copyBody(launchBody(b, kickerLaunchSpeed(b, px, step, kicker, Number(kicker.data!.velocity), ledge)));
        launched = true;
      } else if (launched && (b.grounded || landsOnHighLedge({ x: px, y: b.y, vy: b.vy, supported: false }, ledge))) break;
    }
  }
  return false;
}

describe('obstacles on the street under stunt lines and the park', { timeout: 120_000 }, () => {
  it('puts low obstacles (never people or rails) under most lines and every park', () => {
    let lines = 0;
    let withStreet = 0;
    for (const { pattern, park } of LINES) {
      expect(pattern.pieces.some((x) => isRail(x.kind))).toBe(false);
      for (const o of streetOf(pattern)) expect(LINE_STREET_KINDS).toContain(o.kind);
      if (park) expect(streetOf(pattern).length, 'park').toBeGreaterThanOrEqual(1);
      else {
        lines++;
        if (streetOf(pattern).length > 0) withStreet++;
      }
    }
    expect(withStreet / lines).toBeGreaterThanOrEqual(0.85);
  });

  it('each lies under a launch ledge, behind its landing, with no gap jump before it (a skater who missed one rides the street)', () => {
    for (const { label, pattern, speeds } of LINES) {
      const fast = Math.max(...speeds);
      const pieces = stuntPieces(pattern);
      for (const o of streetOf(pattern)) {
        const { kicker, ledge, earlier } = launchOf(pattern, o);
        expect(ledge.kind, label).toBe('ledge');
        expect(o.x + o.w, label).toBeLessThanOrEqual(ledge.x + ledge.w);
        expect(o.x, label).toBeGreaterThan(kicker.x + kicker.w);
        // Every earlier ledge drops onto a kicker (no gap to miss), and no fall off it reaches the obstacle.
        for (const l of earlier) expect(pieces[pieces.indexOf(l) + 1]!.kind, label).toBe('kicker');
        if (earlier.length > 0) expect(o.x, label).toBeGreaterThan(stuntWorstLanding(earlier, fast));
      }
    }
  });

  it(`each is clearable from the street after rolling past its kicker, with a human take-off window of >= ${EARLY_TAKEOFF_WINDOW} ticks at every speed`, () => {
    for (const { label, pattern, speeds } of LINES) {
      const fast = Math.max(...speeds);
      for (const o of streetOf(pattern)) {
        const { kicker, earlier } = launchOf(pattern, o);
        const origin = Math.max(kickerWindow(kicker, fast).end, earlier.length > 0 ? stuntWorstLanding(earlier, fast) : -Infinity);
        const course = buildCourse([o], origin, (goal) => goal + runoutFor(fast));
        expect(humanFair(solversFor(course, speeds), soberFairness(EARLY_TAKEOFF_WINDOW)), `${label} ${o.kind} at ${o.x}`).toBe(true);
      }
    }
  });

  it('riding the line never touches one: every launch (any press of the window, every human hold, speed and tick phase) flies over it', () => {
    let checked = 0;
    for (const { label, pattern, speeds } of LINES) {
      for (const o of streetOf(pattern)) {
        const { kicker, ledge } = launchOf(pattern, o);
        for (const speed of speeds) {
          for (const phase of [0, 0.5]) {
            for (const hold of HUMAN_HOLDS) {
              checked++;
              expect(launchTouches(kicker, ledge, o, speed, hold, phase), `${label} at ${speed} px/s hold ${hold}`).toBe(false);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('keeps the high five free: no obstacle between the park entrance and its first bank', () => {
    for (const { pattern, park } of LINES) {
      if (!park) continue;
      const bank = stuntPieces(pattern)[0]!;
      for (const o of streetOf(pattern)) expect(o.x).toBeGreaterThan(bank.x + bank.w);
    }
  });
});
