import { describe, expect, it } from 'vitest';
import { GROUND_Y } from '../core/config';
import { Rng } from '../core/rng';
import type { Rect } from '../types';
import { isObstacle, isRail, KICKER, LEDGE } from './catalogue';
import type { Pattern, Piece } from './patterns';
import { KICKER_LIP } from './rules';
import { CONTAINER_LENGTH, HIGH_FIVER_X, PARK_MAX_LENGTH, PARK_MIN_SPEED, parkMaxLength, parkPiecesOf, planParkLine } from './park-line';
import { gapHolds, STUNT_APEX_MAX, STUNT_TAKEOFF_WINDOW, stuntWorstLanding } from './stunt-line';
import { fly, jumpWindow, launched, onLedge, stepOf, windowTicks } from './stunt-sim';
import { runoutFor } from './patterns';

/** Park speeds: the ramp pauses inside, so one speed per park; early, mid and top. */
const SPEEDS = [90, 105, 120, 140, 160, 175, 190];
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

const plans = new Map<string, Pattern>();
function plan(seed: number, speed: number): Pattern {
  const key = `${seed}|${speed}`;
  let p = plans.get(key);
  if (!p) {
    const steps = planParkLine(new Rng(seed), [speed], -seed);
    let s = steps.next();
    while (!s.done) s = steps.next();
    p = s.value;
    plans.set(key, p);
  }
  return p;
}

const each = (fn: (p: Pattern, seed: number, speed: number) => void) => {
  for (const seed of SEEDS) for (const speed of SPEEDS) fn(plan(seed, speed), seed, speed);
};

const stunts = (p: Pattern) => p.pieces.filter((x) => x.kind === 'kicker' || x.kind === 'ledge');
const ledges = (p: Pattern) => p.pieces.filter((x) => x.kind === 'ledge');
const height = (r: Rect) => GROUND_Y - r.y;

function launchFrom(kicker: Piece, speed: number, phase: number, onto: Rect[]) {
  const step = stepOf(speed);
  let x = kicker.x - 40 + phase * step;
  while (x < kicker.x + kicker.w * KICKER_LIP) x += step;
  return fly(launched(Number(kicker.data!.velocity)), x, step, onto);
}

describe('NorDIY park line', { timeout: 60_000 }, () => {
  it('is a park pattern of 3-6 stunt pieces: banks (kickers), two containers, then the crane as the last ledge', () => {
    each((p, seed) => {
      expect(p.name).toBe('park');
      const pieces = stunts(p);
      expect(pieces.length).toBeGreaterThanOrEqual(3);
      expect(pieces.length).toBeLessThanOrEqual(6);
      expect(pieces[0]!.kind).toBe('kicker');
      expect(pieces.at(-1)!.data!.park).toBe('crane');
      expect(ledges(p).map((l) => l.data!.park)).toEqual(['container', 'container', 'crane']);
      for (const k of pieces.filter((x) => x.kind === 'kicker')) expect(k.data!.park).toBe('bank');
      pieces.forEach((piece, i) => {
        expect(piece.data).toMatchObject({ line: -seed, step: i + 1, steps: pieces.length });
        if (i > 0) expect(piece.x).toBeGreaterThan(pieces[i - 1]!.x + pieces[i - 1]!.w);
      });
      expect(p.pieces.every((x) => !isObstacle(x.kind) && !isRail(x.kind))).toBe(true);
    });
  });

  it('both containers share one height in the ledge range and are 80-120 px long; the crane is higher, within reach', () => {
    each((p) => {
      const [a, b, crane] = ledges(p) as [Piece, Piece, Piece];
      expect(height(a)).toBe(height(b));
      expect(height(a)).toBeGreaterThanOrEqual(LEDGE.minHeight);
      expect(height(crane)).toBeGreaterThan(height(a));
      expect(height(crane)).toBeLessThanOrEqual(LEDGE.maxHeight);
      for (const c of [a, b]) {
        expect(c.w).toBeGreaterThanOrEqual(CONTAINER_LENGTH[0]);
        expect(c.w).toBeLessThanOrEqual(LEDGE.maxLength);
      }
      expect(crane.w).toBeGreaterThanOrEqual(a.w);
      expect(crane.w).toBeLessThanOrEqual(LEDGE.maxLength);
    });
  });

  it('every bank launches the skater onto its ledge at the park speed and nearby speeds, at any tick phase', () => {
    each((p, seed, speed) => {
      const pieces = stunts(p);
      pieces.forEach((k, i) => {
        if (k.kind !== 'kicker') return;
        expect(k.w).toBe(KICKER.w);
        for (const phase of [0, 0.25, 0.5, 0.75]) expect(launchFrom(k, speed, phase, [pieces[i + 1]!]).ledge, `seed ${seed} ${speed}`).toBe(0);
      });
    });
  });

  it(`every gap leaves a human take-off window of >= ${STUNT_TAKEOFF_WINDOW} ticks, needs a jump, and stays under STUNT_APEX_MAX`, () => {
    let gaps = 0;
    each((p, seed, speed) => {
      const pieces = stunts(p);
      pieces.forEach((a, i) => {
        const b = pieces[i + 1];
        if (a.kind !== 'ledge' || b?.kind !== 'ledge') return;
        gaps++;
        const w = jumpWindow(a, a.x + Math.round(a.w * 0.4), stepOf(speed), b, gapHolds(a), undefined, STUNT_TAKEOFF_WINDOW);
        expect(windowTicks(w), `seed ${seed} ${speed}`).toBeGreaterThanOrEqual(STUNT_TAKEOFF_WINDOW);
        expect(gapHolds(a).length).toBeGreaterThan(0);
        expect(fly(onLedge(a), a.x + a.w - 1, stepOf(speed), [b]).ledge).toBe(-1);
      });
    });
    expect(gaps).toBeGreaterThan(SEEDS.length * SPEEDS.length * 0.5);
    expect(STUNT_APEX_MAX).toBeLessThanOrEqual(80);
  });

  it('a ledge followed by a bank drops the skater onto the street before it', () => {
    each((p, _seed, speed) => {
      const pieces = stunts(p);
      pieces.forEach((a, i) => {
        const k = pieces[i + 1];
        if (a.kind !== 'ledge' || k?.kind !== 'kicker') return;
        const landing = fly(onLedge(a), a.x + a.w - 1, stepOf(speed), []);
        expect(landing.ledge).toBe(-1);
        expect(landing.x).toBeLessThan(k.x + k.w * KICKER_LIP - 8);
      });
    });
  });

  it('puts a star on the crane boom and keeps every star within the park', () => {
    each((p) => {
      const crane = ledges(p).at(-1)!;
      const stars = p.pieces.filter((x) => x.kind === 'star');
      expect(stars.some((s) => s.x + s.w / 2 >= crane.x && s.x + s.w / 2 <= crane.x + crane.w && s.y < crane.y)).toBe(true);
      for (const s of stars) expect(s.x + s.w).toBeLessThan(p.length);
    });
  });

  it(`spans the park with room for every way off the line, at most parkMaxLength(speed) (up to ${PARK_MAX_LENGTH} px)`, () => {
    const lengths: number[] = [];
    each((p, _seed, speed) => {
      expect(p.length).toBeGreaterThanOrEqual(stuntWorstLanding(stunts(p), speed) + runoutFor(speed));
      expect(p.length).toBeLessThanOrEqual(parkMaxLength(speed));
      expect(parkMaxLength(speed)).toBeLessThanOrEqual(PARK_MAX_LENGTH);
      lengths.push(p.length);
    });
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(600);
  });

  it('one high fiver stands on the street before the first bank, under no ledge', () => {
    each((p) => {
      const fivers = p.pieces.filter((x) => x.kind === 'highFiver');
      expect(fivers.length).toBe(1);
      const f = fivers[0]!;
      expect(f.x).toBe(HIGH_FIVER_X);
      expect(f.y + f.h).toBe(GROUND_Y);
      expect(f.x + f.w).toBeLessThan(stunts(p)[0]!.x - 40);
      for (const l of ledges(p)) expect(f.x + f.w < l.x || f.x > l.x + l.w).toBe(true);
    });
  });

  it('lists its structures as ParkPieces in run distances, 1:1 with the kicker and ledge pieces', () => {
    const p = plan(3, 140);
    const start = 5000;
    const pieces = parkPiecesOf(p, start);
    expect(pieces).toEqual(
      stunts(p).map((s) => ({ kind: s.data!.park, from: start + s.x, to: start + s.x + s.w, height: GROUND_Y - s.y })),
    );
    expect(pieces[0]).toMatchObject({ kind: 'bank', height: KICKER.h });
  });

  it('is deterministic per seed and resumable with a work budget', () => {
    const budget = { left: 300 };
    const steps = planParkLine(new Rng(7), [150], -7, budget);
    let yields = 0;
    for (;;) {
      const s = steps.next();
      if (s.done) {
        expect(s.value).toEqual(plan(7, 150));
        break;
      }
      yields++;
      budget.left = 300;
    }
    expect(yields).toBeGreaterThan(0);
  });

  it(`plans at a crawl or a standstill too: the line for PARK_MIN_SPEED (${PARK_MIN_SPEED} px/s)`, () => {
    for (const speed of [0, 0.5, PARK_MIN_SPEED / 2]) {
      const steps = planParkLine(new Rng(3), [speed], -3);
      let s = steps.next();
      while (!s.done) s = steps.next();
      expect(s.value).toEqual(plan(3, PARK_MIN_SPEED));
    }
  });
});
