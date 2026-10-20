/**
 * Grind scoring (ROADMAP 92): a landing on a rail, bench or ledge scores
 * GRIND_LANDING_POINTS as a trick (contacts.ts hands them in), every tick on
 * it GRIND_POINTS, both times the multiplier. Grinds are short (mostly a
 * fraction of a second), so these points used to arrive silently in small
 * steps; at the end of a rail or bench grind its total now goes out as an
 * `obstacleCleared` of that entity, which the ui shows as a "+N" popup.
 * Stunt ledges get none: the stunt callouts cheer them. The grind trick's
 * points are not in the total (it has its own "Boardslide! +N").
 * The announcement is no clear: `announcing` is true while it goes out, so
 * gameplay does not count it as an obstacle cleared in the air.
 */
import type { GameContext } from '../types';
import { GRIND_POINTS, isLedge } from './catalogue';
import { addPoints } from './scoring';

export class GrindScore {
  /** Entity id of the grind running now (-1: none). */
  private rail = -1;
  private points = 0;
  private announce = false;
  /** True while the grind's total goes out (the obstacleCleared listeners run). */
  announcing = false;

  /** grindStart, once the player is on `entityId`: a grind still running on the previous one ends first. */
  started(ctx: GameContext, entityId: number): void {
    this.finish(ctx);
    const e = ctx.state.entities.find((s) => s.id === entityId);
    this.rail = entityId;
    this.points = 0;
    this.announce = !!e && !isLedge(e.kind);
  }

  /** The landing points of the grind that just started (contacts.ts). */
  landed(points: number): void {
    this.points += points;
  }

  /** Every playing tick, after the player updated its grind flags: one tick of grind points. */
  update(ctx: GameContext): void {
    if (ctx.state.player.grinding) this.points += addPoints(ctx.state, ctx.bus, GRIND_POINTS);
  }

  /** grindEnd of `entityId` (rolled off, jumped off or thrown off). */
  ended(ctx: GameContext, entityId: number): void {
    if (entityId === this.rail) this.finish(ctx);
  }

  reset(): void {
    this.rail = -1;
    this.points = 0;
    this.announce = false;
  }

  private finish(ctx: GameContext): void {
    if (this.rail < 0) return;
    const e = this.announce && this.points > 0 ? ctx.state.entities.find((s) => s.id === this.rail) : undefined;
    this.rail = -1;
    if (!e) return;
    this.announcing = true;
    ctx.bus.emit('obstacleCleared', { entityId: e.id, kind: e.kind, points: this.points });
    this.announcing = false;
  }
}
