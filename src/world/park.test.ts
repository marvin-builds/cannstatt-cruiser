import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X, VIEW_MAX_W } from '../core/config';
import type { ParkPlan } from '../types';
import { DECOR, layoutDecor, ParkStage, parkQuiet, parkX, pieceRect, scenerySpan } from './park';

const PLAN: ParkPlan = {
  start: 1000,
  end: 1460,
  pieces: [
    { kind: 'bank', from: 1030, to: 1048, height: 7 },
    { kind: 'container', from: 1090, to: 1170, height: 40 },
    { kind: 'container', from: 1220, to: 1300, height: 52 },
    { kind: 'crane', from: 1340, to: 1440, height: 66 },
  ],
};

/** Where gameplay draws a stunt entity whose run distance is `run`: its screen x minus the lead, rounded once. */
function entityDrawX(run: number, distance: number, lead: number): number {
  const screenX = run - distance + PLAYER_X;
  return Math.round(screenX - lead);
}

describe('park geometry', () => {
  it('draws every piece exactly over its span with its top edge at its height, for any scroll and lead', () => {
    for (const distance of [700, 812.4, 1000, 1100.75, 1333.3]) {
      for (const lead of [0, 0.4, 1.5, 2.9]) {
        for (const piece of PLAN.pieces) {
          const r = pieceRect(piece, distance, lead);
          expect(r.x).toBe(entityDrawX(piece.from, distance, lead));
          expect(r.w).toBe(piece.to - piece.from);
          expect(r.top).toBe(GROUND_Y - piece.height);
        }
      }
    }
  });

  it('maps run distances like entities: a point at the player when the run reaches it', () => {
    expect(parkX(1000, 1000, 0)).toBe(PLAYER_X);
    expect(parkX(1000, 900, 0)).toBe(PLAYER_X + 100);
    expect(parkX(1000, 900, 2.6)).toBe(PLAYER_X + 97);
  });
});

describe('park decor layout', () => {
  const slots = layoutDecor(PLAN);
  const containers = PLAN.pieces.filter((p) => p.kind === 'container');

  it('places every decor item once', () => {
    expect(slots.map((s) => s.item).sort()).toEqual(Object.keys(DECOR).sort());
  });

  it('keeps the decor out from behind the containers (they would hide it)', () => {
    for (const s of slots) {
      for (const c of containers) expect(s.at + s.w <= c.from || s.at >= c.to, `${s.item} behind container ${c.from}`).toBe(true);
    }
  });

  it('keeps decor items apart from each other', () => {
    const sorted = [...slots].sort((a, b) => a.at - b.at);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.at).toBeGreaterThanOrEqual(sorted[i - 1]!.at + sorted[i - 1]!.w);
  });

  it('spans the plan and all its decor', () => {
    const span = scenerySpan(PLAN, slots);
    expect(span.from).toBeLessThanOrEqual(PLAN.start);
    expect(span.to).toBeGreaterThanOrEqual(PLAN.end);
    for (const s of slots) {
      expect(s.at).toBeGreaterThanOrEqual(span.from);
      expect(s.at + s.w).toBeLessThanOrEqual(span.to);
    }
  });

  it('still places everything for a crowded plan (decor moves out beside the park)', () => {
    const tight: ParkPlan = { start: 0, end: 200, pieces: [{ kind: 'container', from: 0, to: 200, height: 40 }] };
    const placed = layoutDecor(tight);
    expect(placed).toHaveLength(Object.keys(DECOR).length);
    for (const s of placed) expect(s.at + s.w <= 0 || s.at >= 200).toBe(true);
  });
});

describe('parkQuiet (traffic easing around the park)', () => {
  const span = { from: 1000, to: 1500 };
  it('is 1 far from the park, 0 while any of it can be on screen, and 1 again after', () => {
    expect(parkQuiet(span, span.from - 2000)).toBe(1);
    // Visible from the right edge of the widest view until it leaves the left edge.
    expect(parkQuiet(span, span.from + PLAYER_X - VIEW_MAX_W)).toBe(0);
    expect(parkQuiet(span, 1200)).toBe(0);
    expect(parkQuiet(span, span.to + PLAYER_X - 1)).toBe(0);
    expect(parkQuiet(span, span.to + PLAYER_X + 2000)).toBe(1);
  });

  it('eases down before and up after', () => {
    const before = [-900, -600, -500].map((d) => parkQuiet(span, span.from + PLAYER_X - VIEW_MAX_W + d));
    expect(before[0]).toBe(1);
    expect(before[1]!).toBeLessThan(1);
    expect(before[1]!).toBeGreaterThan(0);
    expect(before[2]!).toBeLessThan(before[1]!);
  });
});

describe('ParkStage (the park the world shows)', () => {
  it('shows the planned park with its decor and scenery span', () => {
    const stage = new ParkStage();
    stage.sync(PLAN, 0);
    expect(stage.plan).toEqual(PLAN);
    expect(stage.slots).toEqual(layoutDecor(PLAN));
    expect(stage.span).toEqual(scenerySpan(PLAN, stage.slots));
  });

  it('keeps showing the park after gameplay clears it until it has left the screen', () => {
    const stage = new ParkStage();
    stage.sync(PLAN, 900);
    stage.sync(null, PLAN.end + 10);
    expect(stage.plan).not.toBeNull();
    stage.sync(null, stage.span!.to + PLAYER_X + 1);
    expect(stage.plan).toBeNull();
  });

  it('takes a copy (gameplay may reuse its plan object) and follows a new plan', () => {
    const stage = new ParkStage();
    const plan: ParkPlan = structuredClone(PLAN);
    stage.sync(plan, 0);
    plan.pieces.length = 0;
    expect(stage.plan!.pieces).toHaveLength(4);
    const next: ParkPlan = { start: 9000, end: 9300, pieces: [] };
    stage.sync(next, 8000);
    expect(stage.plan).toEqual(next);
  });

  it('gives the scenery as a screen span for the traffic and the traffic quiet factor', () => {
    const stage = new ParkStage();
    expect(stage.keepOut(0)).toBeNull();
    expect(stage.quiet(0)).toBe(1);
    stage.sync(PLAN, 1000);
    const span = stage.span!;
    expect(stage.keepOut(1000)).toEqual({ from: span.from - 1000 + PLAYER_X, to: span.to - 1000 + PLAYER_X });
    expect(stage.quiet(1200)).toBe(0);
  });

  it('forgets the park on reset (new run)', () => {
    const stage = new ParkStage();
    stage.sync(PLAN, 0);
    stage.reset();
    expect(stage.plan).toBeNull();
  });
});
