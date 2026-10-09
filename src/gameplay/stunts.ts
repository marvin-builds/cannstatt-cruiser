/**
 * Stunt lines at runtime (ROADMAP 27): kicker launches and the line tracker.
 *
 * A line is a run of stunt pieces (kickers on the street, ledges of the upper
 * level) whose entities carry `data.line` (the line's id), `data.step`
 * (1..steps) and `data.steps`. A piece is *made* when a kicker launches the
 * skater (on a jump press in its window, kicker-launch.ts) or a ledge is
 * ground (grindStart).
 *
 * Lifecycle (one attempt at a line at a time):
 *
 * - **Start**: the first piece made while no line runs starts an attempt at
 *   its line, whichever piece it is (a skipped first kicker or an earlier
 *   drop-out does not lose the rest of the line). It scores
 *   STUNT_POINTS[kind] (x1) quietly: the launch or the grind is its feedback,
 *   so there is never a "Combo x1!". A line the skater never makes a piece
 *   of says nothing at all: no stuntStep, no stuntEnd.
 * - **Step**: every further piece made in order (data.step + 1) emits
 *   `stuntStep` with the line multiplier = pieces made in this attempt
 *   (x2, x3 ..., capped at STUNT_MAX_MULTIPLIER) and scores
 *   STUNT_POINTS[kind] times it. `step` is the piece's place in the line.
 * - **End**: every started attempt ends exactly once with `stuntEnd`
 *   (`made` = pieces made in the attempt):
 *   - completed (bonus STUNT_LINE_BONUS per made piece) when the skater
 *     leaves the line's last piece (its grind ends, or the landing after a
 *     last kicker) with at least 2 pieces made;
 *   - incomplete (no bonus) on a street landing while the next piece is a
 *     ledge, when the next kicker passes behind the skater (jumped over),
 *     a piece out of order (it then starts a new attempt), a crash, the next
 *     piece leaving the street, or a single made piece being the last one.
 *   Nothing else happens: no crash, no health, no penalty.
 *
 * Score: stunt points are added as they are (scoring.ts addBonus), not times
 * `state.multiplier`: the line multiplier is its own. The normal combo goes on
 * as before around it (a ledge landing is a trick like a rail landing, a
 * street landing breaks the combo), so a line pays both. An air trick in a
 * line uses the line multiplier when it is higher (air-trick.ts).
 */
import type { Entity, GameContext, GameState, StuntKind } from '../types';
import { isKicker, isLedge } from './catalogue';
import { KickerLaunch } from './kicker-launch';
import { addBonus } from './scoring';

export { DEFAULT_LEDGE_HEIGHT } from './kicker-launch';

/** Base points per made piece (times the line multiplier). */
export const STUNT_POINTS: Record<StuntKind, number> = { kicker: 50, ledge: 100 };
/** The line multiplier is the number of pieces made in the attempt, up to this (the longest line has 6 pieces). */
export const STUNT_MAX_MULTIPLIER = 6;
/** Bonus per made piece of a completed line. */
export const STUNT_LINE_BONUS = 150;

/** The running line as the debug hook shows it. */
export interface StuntLineView {
  line: number;
  steps: number;
  /** Pieces made in this attempt. */
  made: number;
  /** The place in the line (data.step) of the last made piece. */
  step: number;
  multiplier: number;
  /** Stunt points scored by this line so far (no bonus yet). */
  points: number;
}

const num = (e: Entity, key: string): number => {
  const v = e.data?.[key];
  return typeof v === 'number' ? v : 0;
};

export class StuntLines {
  private line: StuntLineView | null = null;
  /** Entity id of the last made piece (its grind end or landing may finish the line). */
  private lastPiece = -1;
  /** The skater left the line's last ledge: the line completes in the next update. */
  private leftLast = false;
  private readonly launches = new KickerLaunch();

  reset(): void {
    this.launches.reset();
    this.line = null;
    this.lastPiece = -1;
    this.leftLast = false;
  }

  /** A copy of the running line, or null. */
  view(): StuntLineView | null {
    return this.line && { ...this.line };
  }

  /** The running line's multiplier, 1 without a line. */
  multiplier(): number {
    return this.line?.multiplier ?? 1;
  }

  /** The player's `jump` event (an ollie may arm a kicker). */
  jumped(state: GameState): void {
    this.launches.jumped(state);
  }

  /** Every playing tick after the contacts: launches from kickers, and whether the next piece was passed by. */
  update(ctx: GameContext): void {
    const launch = this.launches.update(ctx);
    if (launch) {
      launch.kicker.done = true;
      ctx.bus.emit('launch', { entityId: launch.kicker.id, velocity: launch.velocity });
      this.made(ctx, launch.kicker);
    }
    if (this.leftLast && this.line) this.end(ctx);
    else if (this.line && !this.atLastPiece()) this.checkNext(ctx);
  }

  /** A piece was made (a kicker launched, a ledge ground). */
  made(ctx: GameContext, e: Entity): void {
    const id = num(e, 'line');
    const step = num(e, 'step');
    if (id === 0 || step === 0) return;
    if (this.line && (this.line.line !== id || step !== this.line.step + 1)) this.end(ctx);
    const line = (this.line ??= { line: id, steps: 0, made: 0, step, multiplier: 1, points: 0 });
    line.made++;
    line.step = step;
    // Debug lines grow while pieces are placed: the newest piece knows the length.
    line.steps = Math.max(line.steps, step, num(e, 'steps'));
    line.multiplier = Math.min(STUNT_MAX_MULTIPLIER, line.made);
    const points = STUNT_POINTS[isKicker(e.kind) ? 'kicker' : 'ledge'] * line.multiplier;
    line.points += points;
    this.lastPiece = e.id;
    addBonus(ctx.state, ctx.bus, points);
    if (line.made > 1) ctx.bus.emit('stuntStep', { step, steps: line.steps, multiplier: line.multiplier, points });
  }

  /**
   * The player left a rail or ledge (grindEnd): leaving the line's last ledge
   * completes it in this tick's update, unless a crash (its grind end comes
   * first) ends it before.
   */
  grindEnded(entityId: number): void {
    if (this.line && this.atLastPiece() && entityId === this.lastPiece) this.leftLast = true;
  }

  /** The player touched the street (land). */
  landed(ctx: GameContext): void {
    const line = this.line;
    if (!line) return;
    if (this.atLastPiece() || this.next(ctx)?.kind !== 'kicker') this.end(ctx);
  }

  crashed(ctx: GameContext): void {
    if (this.line) this.end(ctx, true);
  }

  private atLastPiece(): boolean {
    return this.line!.step === this.line!.steps;
  }

  /** The next piece of the running line on the street, or null when it is gone. */
  private next(ctx: GameContext): Entity | null {
    const line = this.line!;
    const entities = ctx.state.entities;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if ((isKicker(e.kind) || isLedge(e.kind)) && num(e, 'line') === line.line && num(e, 'step') === line.step + 1) return e;
    }
    return null;
  }

  /** Ends the line when its next piece left the street, or is a kicker the skater passed without a launch. */
  private checkNext(ctx: GameContext): void {
    const next = this.next(ctx);
    if (!next || (isKicker(next.kind) && !next.done && next.x + next.w < ctx.state.player.x)) this.end(ctx);
  }

  /** Ends the attempt: completed when it got to the line's last piece with at least 2 pieces made (never on a crash). */
  private end(ctx: GameContext, crashed = false): void {
    const line = this.line!;
    const completed = !crashed && line.step === line.steps && line.made >= 2;
    this.line = null;
    this.lastPiece = -1;
    this.leftLast = false;
    const points = completed ? STUNT_LINE_BONUS * line.made : 0;
    if (points > 0) addBonus(ctx.state, ctx.bus, points);
    ctx.bus.emit('stuntEnd', { steps: line.steps, made: line.made, completed, points });
  }
}
