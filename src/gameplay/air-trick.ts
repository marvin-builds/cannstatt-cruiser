/**
 * Air trick scoring (Stunt Wave B). The player system sets player.airTrick
 * while its kickflip runs; gameplay only reads it (the trick never changes
 * the physics, so jumpsim and the solver know nothing of it).
 *
 * - A trick runs while the flag is set and the skater is in the air; it ends
 *   when the flag goes back to false or the skater touches down (a rail or
 *   ledge catch cuts it short: it still counts, with the ticks it ran).
 * - Ended tricks wait for the next clean touchdown: a street landing (`land`)
 *   or a grind start on a rail, bench or ledge (`grindStart`). At the end of
 *   that tick each one emits `airTrick {ticks, points}` once.
 * - A crash before or on the touchdown tick drops them: nothing is awarded.
 * - Points: AIR_TRICK_POINTS times the best multiplier seen from the trick to
 *   its touchdown, the normal combo multiplier or, inside a running stunt
 *   line, the line's multiplier when that is higher. The trick is no line
 *   piece: it adds no stuntStep and never ends or extends a line.
 */
import type { GameContext } from '../types';
import { addBonus } from './scoring';

/** Base points of an air trick (times the multiplier). */
export const AIR_TRICK_POINTS = 150;

export class AirTrickScore {
  /** Ticks of the trick running now (0: none). */
  private running = 0;
  /** Ticks of the tricks that ended and wait for a clean touchdown. */
  private readonly pending: number[] = [];
  private best = 1;
  private touched = false;
  private crashed = false;

  /** @param lineMultiplier the running stunt line's multiplier (1 without a line). */
  constructor(private readonly lineMultiplier: () => number) {}

  reset(): void {
    this.running = 0;
    this.pending.length = 0;
    this.best = 1;
    this.touched = false;
    this.crashed = false;
  }

  /** Every playing tick, after the player and before the contacts. */
  update(ctx: GameContext): void {
    const p = ctx.state.player;
    if (p.airTrick && !p.grounded && !p.grinding && p.state !== 'crash') this.running++;
    else this.endRunning();
    if (this.running > 0 || this.pending.length > 0) this.noteMultiplier(ctx);
  }

  /** The skater touched down cleanly (land, grindStart). */
  touchedDown(): void {
    this.touched = true;
  }

  crashedNow(): void {
    this.crashed = true;
    this.running = 0;
    this.pending.length = 0;
  }

  /** At the end of every playing tick: award the waiting tricks after a clean touchdown this tick. */
  settle(ctx: GameContext): void {
    if (this.touched) {
      this.endRunning();
      if (!this.crashed && ctx.state.player.state !== 'crash') this.award(ctx);
      this.pending.length = 0;
    }
    if (this.running === 0 && this.pending.length === 0) this.best = 1;
    this.touched = false;
    this.crashed = false;
  }

  private award(ctx: GameContext): void {
    this.noteMultiplier(ctx);
    for (const ticks of this.pending) {
      const points = addBonus(ctx.state, ctx.bus, AIR_TRICK_POINTS * this.best);
      ctx.bus.emit('airTrick', { ticks, points });
    }
  }

  private endRunning(): void {
    if (this.running === 0) return;
    this.pending.push(this.running);
    this.running = 0;
  }

  private noteMultiplier(ctx: GameContext): void {
    this.best = Math.max(this.best, ctx.state.multiplier, this.lineMultiplier());
  }
}
