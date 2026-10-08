/**
 * NorDIY skatepark (ROADMAP 36) geometry, DOM-free: where the world draws the
 * park gameplay planned (state.park). Pieces live in run distances like
 * stunt entities, so they are drawn exactly like them: a run distance `d` is
 * at screen x `d - state.distance + PLAYER_X`, minus RenderContext.scrollLead,
 * rounded once. The decor (crowd, building site, spool table, bank skater, tree) is laid
 * out once per plan into the gaps the containers leave free; traffic eases
 * out while any of the scenery can be on screen. Art lives in art/park*.ts.
 */
import { GROUND_Y, PLAYER_X, VIEW_MAX_W } from '../core/config';
import type { ParkPiece, ParkPlan } from '../types';

/** A screen rect of one piece: left edge, width and top row (the ledge / lip surface). */
export interface PieceRect {
  x: number;
  w: number;
  top: number;
}

/** A run-distance span [from, to). */
export interface Span {
  from: number;
  to: number;
}

/** Background decor of the park, by name, with its width (view px). */
export const DECOR = { build: 74, crowd: 48, spool: 36, skater: 40, tree: 18 } as const;
export type DecorItem = keyof typeof DECOR;
/** Placement order: the most important first, so it gets the best gap. */
const DECOR_ORDER: readonly DecorItem[] = ['crowd', 'build', 'spool', 'skater', 'tree'];
/** Free room kept on each side of a decor item. */
const DECOR_PAD = 3;

/** A decor item placed at run distance `at` (its left edge), `w` wide. */
export interface DecorSlot {
  item: DecorItem;
  at: number;
  w: number;
}

/** Crane: lattice tower width, centred on the boom's left end (`from`). */
export const CRANE_TOWER_W = 8;
/** Crane: the mast rises this far above the boom's top edge. */
export const CRANE_MAST = 18;
/** Crane: counterweight jib behind the tower, as a share of the boom length. */
export const CRANE_JIB_SHARE = 0.35;

/** Run distance -> screen x to draw at (like a stunt entity: screen x minus the lead, rounded once). */
export function parkX(run: number, distance: number, scrollLead: number): number {
  return Math.round(run - distance + PLAYER_X - scrollLead);
}

/** The screen rect of `piece` this frame (`out` is reused when given). */
export function pieceRect(piece: ParkPiece, distance: number, scrollLead: number, out: PieceRect = { x: 0, w: 0, top: 0 }): PieceRect {
  out.x = parkX(piece.from, distance, scrollLead);
  out.w = Math.round(piece.to - piece.from);
  out.top = GROUND_Y - piece.height;
  return out;
}

/** Counterweight jib length of a crane piece. */
export function craneJib(piece: ParkPiece): number {
  return Math.round((piece.to - piece.from) * CRANE_JIB_SHARE);
}

/** Run-distance span a piece covers when drawn (the crane adds its tower and jib behind `from`). */
function pieceSpan(piece: ParkPiece): Span {
  if (piece.kind !== 'crane') return { from: piece.from, to: piece.to };
  return { from: piece.from - Math.max(craneJib(piece), CRANE_TOWER_W / 2), to: piece.to };
}

/** What hides decor drawn behind it: the container bodies and the crane towers. */
function blockers(plan: ParkPlan): Span[] {
  const out: Span[] = [];
  for (const p of plan.pieces) {
    if (p.kind === 'container') out.push({ from: p.from, to: p.to });
    else if (p.kind === 'crane') out.push({ from: p.from - CRANE_TOWER_W / 2, to: p.from + CRANE_TOWER_W / 2 });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The gaps of [plan.start, plan.end) no blocker covers. */
function freeGaps(plan: ParkPlan): Span[] {
  const gaps: Span[] = [];
  let at = plan.start;
  for (const b of blockers(plan)) {
    if (b.from > at) gaps.push({ from: at, to: b.from });
    at = Math.max(at, b.to);
  }
  if (plan.end > at) gaps.push({ from: at, to: plan.end });
  return gaps;
}

/**
 * Places every decor item once: into the widest free gap that fits it
 * (centred), else beside the park, alternately after its end and before its
 * start. Deterministic per plan.
 */
export function layoutDecor(plan: ParkPlan): DecorSlot[] {
  const gaps = freeGaps(plan);
  const slots: DecorSlot[] = [];
  let after = Math.max(plan.end, ...plan.pieces.map((p) => p.to));
  let before = Math.min(plan.start, ...plan.pieces.map((p) => pieceSpan(p).from));
  let outside = 0;
  for (const item of DECOR_ORDER) {
    const w = DECOR[item];
    const room = w + 2 * DECOR_PAD;
    let best = -1;
    for (let i = 0; i < gaps.length; i++) {
      const size = gaps[i]!.to - gaps[i]!.from;
      if (size >= room && (best < 0 || size > gaps[best]!.to - gaps[best]!.from)) best = i;
    }
    if (best >= 0) {
      const gap = gaps[best]!;
      const at = Math.round((gap.from + gap.to - w) / 2);
      slots.push({ item, at, w });
      gaps.splice(best, 1, { from: gap.from, to: at - DECOR_PAD }, { from: at + w + DECOR_PAD, to: gap.to });
    } else if (outside++ % 2 === 0) {
      slots.push({ item, at: after + DECOR_PAD, w });
      after += room;
    } else {
      before -= room;
      slots.push({ item, at: before + DECOR_PAD, w });
    }
  }
  return slots;
}

/** Run-distance span of everything the park draws (plan, pieces and decor). */
export function scenerySpan(plan: ParkPlan, slots: readonly DecorSlot[]): Span {
  let from = plan.start;
  let to = plan.end;
  for (const p of plan.pieces) {
    const s = pieceSpan(p);
    from = Math.min(from, s.from);
    to = Math.max(to, s.to);
  }
  for (const s of slots) {
    from = Math.min(from, s.at);
    to = Math.max(to, s.at + s.w);
  }
  return { from, to };
}

/** Run distance over which the traffic eases out before the park (and back in after it). */
const QUIET_RAMP = 700;

/**
 * Traffic density factor 0..1 at run distance `distance`: 0 while any of the
 * scenery span can be on screen (from its entry at the right edge of the
 * widest view until it has left the left edge), easing in and out around it.
 */
export function parkQuiet(span: Span, distance: number): number {
  const enters = span.from + PLAYER_X - VIEW_MAX_W;
  const leaves = span.to + PLAYER_X;
  return Math.max(clamp01((enters - distance) / QUIET_RAMP), clamp01((distance - leaves) / QUIET_RAMP));
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/**
 * The park the world shows: a copy of the plan gameplay set (state.park),
 * its decor and scenery span. It stays after gameplay clears the plan until
 * the scenery has left the screen, so nothing vanishes in view.
 */
export class ParkStage {
  plan: ParkPlan | null = null;
  slots: DecorSlot[] = [];
  span: Span | null = null;
  /** The plan object the copy was taken from. */
  private source: ParkPlan | null = null;
  /** Reused keep-out span for the traffic. */
  private readonly screen: Span = { from: 0, to: 0 };

  /** Follows state.park at run distance `distance` (call every tick). */
  sync(park: ParkPlan | null, distance: number): void {
    if (park && park !== this.source) {
      this.source = park;
      this.plan = { start: park.start, end: park.end, pieces: park.pieces.map((p) => ({ ...p })) };
      this.slots = layoutDecor(this.plan);
      this.span = scenerySpan(this.plan, this.slots);
    } else if (!park && this.span && distance > this.span.to + PLAYER_X) {
      this.reset();
    }
  }

  reset(): void {
    this.plan = null;
    this.source = null;
    this.slots = [];
    this.span = null;
  }

  /** The scenery span in screen x at run distance `distance` (for the traffic), or null without a park. */
  keepOut(distance: number): Span | null {
    if (!this.span) return null;
    this.screen.from = this.span.from - distance + PLAYER_X;
    this.screen.to = this.span.to - distance + PLAYER_X;
    return this.screen;
  }

  /** Traffic density factor at `distance` (parkQuiet; 1 without a park). */
  quiet(distance: number): number {
    return this.span ? parkQuiet(this.span, distance) : 1;
  }
}
