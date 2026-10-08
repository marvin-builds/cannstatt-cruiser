/**
 * Stunt lines at runtime (ROADMAP 27): kicker launches and the line tracker.
 *
 * A line is a run of stunt pieces (kickers on the street, ledges of the upper
 * level) whose entities carry `data.line` (the line's id), `data.step`
 * (1..steps) and `data.steps`. A piece is *made* when a kicker launches the
 * skater or a ledge is ground (grindStart). The line starts with its step 1
 * and counts on while the pieces are made in order:
 *
 * - every made piece emits `stuntStep` with the line multiplier = its step
 *   (x1, x2, x3 ..., capped at STUNT_MAX_MULTIPLIER) and scores
 *   STUNT_POINTS[kind] times it;
 * - leaving the last piece (its grind ends, or the landing after a last
 *   kicker) completes the line: `stuntEnd` with the bonus
 *   STUNT_LINE_BONUS per step;
 * - landing on the street while the next piece is a ledge, the next kicker
 *   passing behind the skater (jumped over), a piece out of order, a crash
 *   or the next piece leaving the street ends it incomplete: `stuntEnd`
 *   without bonus. Nothing else happens: no crash, no health, no penalty.
 *
 * Score: stunt points are added as they are (scoring.ts addBonus), not times
 * `state.multiplier`: the line multiplier is its own. The normal combo goes on
 * as before around it (a ledge landing is a trick like a rail landing, a
 * street landing breaks the combo), so a line pays both.
 */
import type { Entity, GameContext, StuntKind } from '../types';
import { isKicker, isLedge } from './catalogue';
import { feetOf, hitsKicker, launchVelocityFor } from './rules';
import { addBonus } from './scoring';

/** Base points per made piece (times the line multiplier). */
export const STUNT_POINTS: Record<StuntKind, number> = { kicker: 50, ledge: 100 };
/** The line multiplier is the step number, up to this (the longest line has 6 pieces). */
export const STUNT_MAX_MULTIPLIER = 6;
/** Bonus per piece of a completed line. */
export const STUNT_LINE_BONUS = 150;
/** Ledge height a kicker without line data launches for (debug-placed pieces). */
export const DEFAULT_LEDGE_HEIGHT = 48;

/** The running line as the debug hook shows it. */
export interface StuntLineView {
  line: number;
  steps: number;
  made: number;
  multiplier: number;
  /** Stunt points scored by this line so far (no bonus yet). */
  points: number;
}

/** Launch speed of a kicker entity (its `data.velocity`, else the default ledge height's). */
function kickerVelocity(e: Entity): number {
  const v = e.data?.velocity;
  return typeof v === 'number' ? v : launchVelocityFor(DEFAULT_LEDGE_HEIGHT);
}

const num = (e: Entity, key: string): number => {
  const v = e.data?.[key];
  return typeof v === 'number' ? v : 0;
};

export class StuntLines {
  private line: StuntLineView | null = null;
  /** Entity id of the last made piece (its grind end or landing may finish the line). */
  private lastPiece = -1;

  reset(): void {
    this.line = null;
    this.lastPiece = -1;
  }

  /** A copy of the running line, or null. */
  view(): StuntLineView | null {
    return this.line && { ...this.line };
  }

  /** Every playing tick after the contacts: launches from kickers, and whether the next piece was passed by. */
  update(ctx: GameContext): void {
    this.launchFromKickers(ctx);
    if (this.line && this.line.made < this.line.steps) this.checkNext(ctx);
  }

  /** A piece was made (a kicker launched, a ledge ground). */
  made(ctx: GameContext, e: Entity): void {
    const id = num(e, 'line');
    const step = num(e, 'step');
    if (id === 0 || step === 0) return;
    const line = this.line;
    if (line && (line.line !== id || step !== line.made + 1)) this.end(ctx, false);
    if (!this.line) {
      if (step !== 1) return;
      this.line = { line: id, steps: 0, made: 0, multiplier: 1, points: 0 };
    }
    const running = this.line!;
    running.made = step;
    // Debug lines grow while pieces are placed: the newest piece knows the length.
    running.steps = Math.max(running.made, num(e, 'steps'));
    running.multiplier = Math.min(STUNT_MAX_MULTIPLIER, step);
    const points = STUNT_POINTS[isKicker(e.kind) ? 'kicker' : 'ledge'] * running.multiplier;
    running.points += points;
    this.lastPiece = e.id;
    addBonus(ctx.state, ctx.bus, points);
    ctx.bus.emit('stuntStep', { step, steps: running.steps, multiplier: running.multiplier, points });
  }

  /** The player left a rail or ledge (grindEnd): leaving the line's last ledge completes it. */
  grindEnded(ctx: GameContext, entityId: number): void {
    if (this.line && this.line.made === this.line.steps && entityId === this.lastPiece) this.end(ctx, true);
  }

  /** The player touched the street (land). */
  landed(ctx: GameContext): void {
    const line = this.line;
    if (!line) return;
    if (line.made === line.steps) this.end(ctx, true);
    else if (this.next(ctx)?.kind !== 'kicker') this.end(ctx, false);
  }

  crashed(ctx: GameContext): void {
    if (this.line) this.end(ctx, false);
  }

  private launchFromKickers(ctx: GameContext): void {
    const p = ctx.state.player;
    if (p.state === 'crash') return;
    const feet = feetOf(p);
    const entities = ctx.state.entities;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (!isKicker(e.kind) || e.done || !hitsKicker(feet, e)) continue;
      e.done = true;
      ctx.bus.emit('launch', { entityId: e.id, velocity: kickerVelocity(e) });
      this.made(ctx, e);
      return;
    }
  }

  /** The next piece of the running line on the street, or null when it is gone. */
  private next(ctx: GameContext): Entity | null {
    const line = this.line!;
    const entities = ctx.state.entities;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if ((isKicker(e.kind) || isLedge(e.kind)) && num(e, 'line') === line.line && num(e, 'step') === line.made + 1) return e;
    }
    return null;
  }

  /** Ends the line when its next piece left the street, or is a kicker the skater passed without a launch. */
  private checkNext(ctx: GameContext): void {
    const next = this.next(ctx);
    if (!next || (isKicker(next.kind) && !next.done && next.x + next.w < ctx.state.player.x)) this.end(ctx, false);
  }

  private end(ctx: GameContext, completed: boolean): void {
    const line = this.line!;
    this.line = null;
    this.lastPiece = -1;
    const points = completed ? STUNT_LINE_BONUS * line.steps : 0;
    if (points > 0) addBonus(ctx.state, ctx.bus, points);
    ctx.bus.emit('stuntEnd', { steps: line.steps, made: line.made, completed, points });
  }
}
