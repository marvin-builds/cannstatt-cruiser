/**
 * Grind trick scoring: while the player grinds with player.grindTrick set
 * (down held on a rail or bench; the player system sets it), every tick
 * scores GRIND_TRICK_POINTS (times the multiplier) on top of the grind
 * points. When the trick ends (down released, the grind ends, or a new
 * grind starts) gameplay emits grindTrick with its ticks and points.
 */
import type { GameContext } from '../types';
import { addPoints } from './scoring';

/** Points per tick of a grind trick (times the multiplier). */
export const GRIND_TRICK_POINTS = 3;

export class GrindTrick {
  /** Entity id of the rail / bench being ground (from grindStart). */
  private rail = -1;
  private ticks = 0;
  private points = 0;

  /** gameplay emitted grindStart: a trick still running on the previous rail ends. */
  grindStarted(ctx: GameContext, entityId: number): void {
    this.finish(ctx);
    this.rail = entityId;
  }

  /** Every playing tick, after the player updated its grind flags. */
  update(ctx: GameContext): void {
    const p = ctx.state.player;
    if (p.grinding && p.grindTrick) {
      this.ticks++;
      this.points += addPoints(ctx.state, ctx.bus, GRIND_TRICK_POINTS);
    } else this.finish(ctx);
  }

  reset(): void {
    this.rail = -1;
    this.ticks = 0;
    this.points = 0;
  }

  private finish(ctx: GameContext): void {
    if (this.ticks === 0) return;
    ctx.bus.emit('grindTrick', { entityId: this.rail, ticks: this.ticks, points: this.points });
    this.ticks = 0;
    this.points = 0;
  }
}
