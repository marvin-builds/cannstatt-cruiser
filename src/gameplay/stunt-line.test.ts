import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import { Rng } from '../core/rng';
import type { Rect } from '../types';
import { isObstacle, isRail, KICKER, LEDGE } from './catalogue';
import { HUMAN_HOLDS } from './fairness';
import { HITBOX_H } from '../player/tuning';
import { groundBody, stepBody } from './jumpsim';
import type { Pattern, Piece } from './patterns';
import { KICKER_LIP, launchVelocityFor } from './rules';
import { drawShape, gapHolds, planStuntLine, shapeOf, STUNT_APEX_MAX, STUNT_SHAPES, STUNT_TAKEOFF_WINDOW, stuntWorstLanding, type StuntShape } from './stunt-line';
import { fly, jumpWindow, launched, onLedge, stepOf, windowTicks } from './stunt-sim';

/** Speed ranges a line is planned for: early ramp, mid, top speed, and pinned speeds. */
const RANGES = [[90, 99], [140, 152], [181, 190], [190], [120], [90]];

const plans = new Map<string, Pattern>();

/** The line for this seed and speed range (cached: planning simulates many flights). */
function plan(seed: number, speeds: number[], zone = seed % 3, shape?: StuntShape): Pattern {
  const key = `${seed}|${speeds.join()}|${zone}|${shape}`;
  let p = plans.get(key);
  if (!p) {
    const steps = planStuntLine(new Rng(seed), speeds, zone, seed, undefined, shape);
    for (let s = steps.next(); ; s = steps.next()) {
      if (s.done) {
        p = s.value;
        break;
      }
    }
    plans.set(key, p);
  }
  return p;
}

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

const stuntPieces = (p: Pattern) => p.pieces.filter((x) => x.kind === 'kicker' || x.kind === 'ledge');
const speedsOf = (range: number[]) => [range[0]!, (range[0]! + range[range.length - 1]!) / 2, range[range.length - 1]!];

/** Where the skater riding on the street at `speed` (phase 0..1 of a tick) is launched by `kicker`, and where that launch comes down. */
function launchFrom(kicker: Piece, speed: number, phase: number, ledges: Rect[]) {
  const step = stepOf(speed);
  let x = kicker.x - 40 + phase * step;
  while (x < kicker.x + kicker.w * KICKER_LIP) x += step;
  return fly(launched(Number(kicker.data!.velocity)), x, step, ledges);
}

describe('stunt line planner', { timeout: 60_000 }, () => {
  it('lays 3-6 stunt pieces in order: a kicker first, ledges 40-60 px up, 40-120 px long, themed by the zone, never an obstacle or rail', () => {
    const lengths = new Set<number>();
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const p = plan(seed, range);
        const pieces = stuntPieces(p);
        lengths.add(pieces.length);
        expect(p.name).toBe('stunt');
        expect(pieces.length).toBeGreaterThanOrEqual(3);
        expect(pieces.length).toBeLessThanOrEqual(6);
        expect(pieces[0]!.kind).toBe('kicker');
        expect(p.pieces.every((x) => !isObstacle(x.kind) && !isRail(x.kind))).toBe(true);
        pieces.forEach((piece, i) => {
          expect(piece.data).toMatchObject({ line: seed, step: i + 1, steps: pieces.length });
          if (i > 0) expect(piece.x).toBeGreaterThan(pieces[i - 1]!.x + pieces[i - 1]!.w);
          if (piece.kind === 'ledge') {
            const height = GROUND_Y - piece.y;
            expect(height).toBeGreaterThanOrEqual(40);
            expect(height).toBeLessThanOrEqual(60);
            expect(piece.w).toBeGreaterThanOrEqual(LEDGE.minLength);
            expect(piece.w).toBeLessThanOrEqual(LEDGE.maxLength);
            expect(piece.data!.zone).toBe(seed % 3);
          } else {
            expect(piece.w).toBe(KICKER.w);
            // A kicker is always followed by a ledge and launches for its height.
            const next = pieces[i + 1]!;
            expect(next.kind).toBe('ledge');
            expect(piece.data!.velocity).toBe(launchVelocityFor(GROUND_Y - next.y));
          }
        });
      }
    }
    expect([...lengths].sort()).toEqual([3, 4, 5, 6]);
  });

  it('every kicker launches the skater onto its ledge at every speed of the range and any tick phase', () => {
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const pieces = stuntPieces(plan(seed, range));
        pieces.forEach((k, i) => {
          if (k.kind !== 'kicker') return;
          const ledge = pieces[i + 1]!;
          for (const speed of speedsOf(range)) {
            for (const phase of [0, 0.25, 0.5, 0.75]) {
              expect(launchFrom(k, speed, phase, [ledge]).ledge, `seed ${seed} ${speed} px/s`).toBe(0);
            }
          }
        });
      }
    }
  });

  it(`every gap between two ledges leaves a human take-off window of >= ${STUNT_TAKEOFF_WINDOW} ticks (one of the human holds)`, () => {
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const pieces = stuntPieces(plan(seed, range));
        pieces.forEach((a, i) => {
          const b = pieces[i + 1];
          if (a.kind !== 'ledge' || b?.kind !== 'ledge') return;
          for (const speed of speedsOf(range)) {
            // Arriving anywhere in the ledge's first 40 % (launch landings and gap jumps come down there).
            const arrival = a.x + Math.round(a.w * 0.4);
            const w = jumpWindow(a, arrival, stepOf(speed), b, gapHolds(a), undefined, STUNT_TAKEOFF_WINDOW);
            expect(windowTicks(w), `seed ${seed} ${speed} px/s`).toBeGreaterThanOrEqual(STUNT_TAKEOFF_WINDOW);
          }
        });
      }
    }
  });

  it(`gap jumps use only human holds that keep the skater on screen (apex <= ${STUNT_APEX_MAX} px above the street, under the HUD)`, () => {
    for (const height of [LEDGE.minHeight, 48, LEDGE.maxHeight]) {
      const ledge = { x: 0, y: GROUND_Y - height, w: 2000, h: 4 };
      const holds = gapHolds(ledge);
      expect(holds.length).toBeGreaterThan(0);
      for (const hold of HUMAN_HOLDS) {
        let b = onLedge(ledge);
        let apex = 0;
        for (let t = 0; t < 120; t++) {
          b = stepBody(b, 0, t === 0, t < hold);
          apex = Math.max(apex, GROUND_Y - b.y);
        }
        expect(holds.includes(hold), `hold ${hold} from ${height} px: apex ${apex}`).toBe(apex <= STUNT_APEX_MAX);
      }
    }
    // Stars never sit higher than that either.
    for (const seed of SEEDS) {
      for (const star of plan(seed, [150]).pieces.filter((x) => x.kind === 'star')) expect(GROUND_Y - star.y).toBeLessThanOrEqual(STUNT_APEX_MAX + HITBOX_H.tucked);
    }
  });

  it('a gap needs a jump: rolling off the ledge end without one falls to the street, at every speed', () => {
    let gaps = 0;
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const pieces = stuntPieces(plan(seed, range));
        pieces.forEach((a, i) => {
          const b = pieces[i + 1];
          if (a.kind !== 'ledge' || b?.kind !== 'ledge') return;
          gaps++;
          for (const speed of speedsOf(range)) expect(fly(onLedge(a), a.x + a.w - 1, stepOf(speed), [b]).ledge, `seed ${seed} ${speed} px/s`).toBe(-1);
        });
      }
    }
    expect(gaps).toBeGreaterThan(80);
  });

  it('a ledge followed by a kicker drops the skater onto the street before the kicker, at every speed', () => {
    let drops = 0;
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const pieces = stuntPieces(plan(seed, range));
        pieces.forEach((a, i) => {
          const k = pieces[i + 1];
          if (a.kind !== 'ledge' || k?.kind !== 'kicker') return;
          drops++;
          for (const speed of speedsOf(range)) {
            const landing = fly(onLedge(a), a.x + a.w - 1, stepOf(speed), []);
            expect(landing.ledge).toBe(-1);
            expect(landing.x).toBeLessThan(k.x + k.w * KICKER_LIP - 8);
          }
        });
      }
    }
    expect(drops).toBeGreaterThan(20);
  });

  it('the line is long enough that every way off it (also a full jump off the last ledge end) lands before it ends, with runout', () => {
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const p = plan(seed, range);
        const fast = Math.max(...range);
        const pieces = stuntPieces(p);
        const worst = stuntWorstLanding(pieces, fast);
        for (const piece of pieces) {
          if (piece.kind !== 'ledge') continue;
          const full = fly(onLedge(piece), piece.x + piece.w - 1, stepOf(fast), [], 0, 20);
          expect(full.x).toBeLessThanOrEqual(worst);
        }
        expect(p.length).toBeGreaterThanOrEqual(worst + 40);
        // Stars only along the line, never beyond its end.
        for (const star of p.pieces.filter((x) => x.kind === 'star')) expect(star.x + star.w).toBeLessThan(p.length);
      }
    }
  });

  it('puts a star trail along every ledge, where the grinding skater passes', () => {
    for (const seed of SEEDS) {
      for (const range of RANGES) {
        const p = plan(seed, range);
        const stars = p.pieces.filter((x) => x.kind === 'star');
        for (const ledge of stuntPieces(p).filter((x) => x.kind === 'ledge')) {
          const along = stars.filter((s) => {
            const cx = s.x + s.w / 2;
            return cx >= ledge.x && cx <= ledge.x + ledge.w && s.y + s.h > ledge.y - HITBOX_H.standing && s.y < ledge.y;
          });
          expect(along.length, `seed ${seed} ${range.join('-')} px/s ledge at ${ledge.x}`).toBeGreaterThanOrEqual(1);
        }
        // Never two stars on top of each other.
        for (const a of stars) for (const b of stars) if (a !== b) expect(Math.abs(a.x - b.x) >= 10 || Math.abs(a.y - b.y) >= 10).toBe(true);
      }
    }
  });

  it('plans the shape asked for: stairs (gap jumps only), hops (a drop onto a kicker first) or mixed (gaps, then a drop)', () => {
    expect(STUNT_SHAPES.length).toBeGreaterThanOrEqual(3);
    let asked = 0;
    let got = 0;
    for (const shape of STUNT_SHAPES) {
      for (const seed of SEEDS) {
        for (const range of RANGES) {
          asked++;
          if (shapeOf(stuntPieces(plan(seed, range, seed % 3, shape))) === shape) got++;
        }
      }
    }
    expect(got / asked).toBeGreaterThanOrEqual(0.9);
  });

  it('draws the shapes from a shuffle bag: every shape once per round, never the same twice in a row', () => {
    const rng = new Rng(9);
    let bag: readonly StuntShape[] = [];
    let last: StuntShape | null = null;
    const drawn: StuntShape[] = [];
    for (let i = 0; i < 30 * STUNT_SHAPES.length; i++) {
      const next = drawShape(rng, bag, last);
      bag = next.bag;
      last = next.shape;
      drawn.push(next.shape);
    }
    for (let round = 0; round < 30; round++) {
      const shapes = drawn.slice(round * STUNT_SHAPES.length, (round + 1) * STUNT_SHAPES.length);
      expect([...shapes].sort()).toEqual([...STUNT_SHAPES].sort());
    }
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]).not.toBe(drawn[i - 1]);
  });

  it('puts a star trail on the line (over a gap jump or the final drop)', () => {
    let withStars = 0;
    for (let seed = 1; seed <= 30; seed++) if (plan(seed, [150]).pieces.some((x) => x.kind === 'star')) withStars++;
    expect(withStars).toBeGreaterThanOrEqual(27);
  });

  it('is deterministic per seed and spends work units in steps (resumable)', () => {
    expect(plan(5, [150])).toEqual(plan(5, [150]));
    const budget = { left: 300 };
    const steps = planStuntLine(new Rng(5), [150], 0, 5, budget);
    let yields = 0;
    for (;;) {
      const s = steps.next();
      if (s.done) {
        expect(s.value).toEqual(plan(5, [150], 0));
        break;
      }
      yields++;
      budget.left = 300;
    }
    expect(yields).toBeGreaterThan(0);
  });

  it('a launch with no ledge comes back to the street (missing never crashes, there is nothing else)', () => {
    const p = plan(3, [150]);
    const k = stuntPieces(p)[0]!;
    expect(launchFrom(k, 150, 0, []).ledge).toBe(-1);
    expect(fly(groundBody(), 0, 2, []).ledge).toBe(-1);
  });
});
