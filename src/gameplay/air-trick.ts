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
 * - Points: the trick's base times the best multiplier seen from the trick to
 *   its touchdown, the normal combo multiplier or, inside a running stunt
 *   line, the line's multiplier when that is higher. The trick is no line
 *   piece: it adds no stuntStep and never ends or extends a line. The base is AIR_TRICK_POINTS for a launch kickflip
 *   (a kicker launched the skater since his last touchdown, event `launch`)
 *   and STREET_AIR_TRICK_POINTS for a street kickflip (any other flight).
 *   Gameplay never gates the trick: whatever the player's start rule
 *   (player/air-trick.ts canStartAirTrick) lets run is scored.
 */
import type { GameContext } from '../types';
import { addBonus } from './scoring';

/** Base points of a launch kickflip (times the multiplier). */
export const AIR_TRICK_POINTS = 150;
/** Base points of a street kickflip, a flight without a kicker launch (times the multiplier). */
export const STREET_AIR_TRICK_POINTS = 100;

/** A trick that ended and waits for a clean touchdown. */
interface EndedTrick {
  ticks: number;
  base: number;
}

export class AirTrickScore {
  /** Ticks of the trick running now (0: none). */
  private running = 0;
  /** Base points of the running trick. */
  private runningBase = STREET_AIR_TRICK_POINTS;
  /** A kicker launched the skater since his last touchdown. */
  private launchedFlight = false;
  private readonly pending: EndedTrick[] = [];
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
    this.launchedFlight = false;
  }

  /** A kicker launched the skater (event `launch`): tricks until the next touchdown are launch kickflips. */
  launched(): void {
    this.launchedFlight = true;
  }

  /** Every playing tick, after the player and before the contacts. */
  update(ctx: GameContext): void {
    const p = ctx.state.player;
    if (p.airTrick && !p.grounded && !p.grinding && p.state !== 'crash') this.run();
    else this.endRunning();
    if (this.running > 0 || this.pending.length > 0) this.noteMultiplier(ctx);
  }

  /** The skater touched down cleanly (land, grindStart). */
  touchedDown(): void {
    this.touched = true;
    this.launchedFlight = false;
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
    for (const { ticks, base } of this.pending) {
      const points = addBonus(ctx.state, ctx.bus, base * this.best);
      ctx.bus.emit('airTrick', { ticks, points });
    }
  }

  private run(): void {
    if (this.running === 0) this.runningBase = this.launchedFlight ? AIR_TRICK_POINTS : STREET_AIR_TRICK_POINTS;
    this.running++;
  }

  private endRunning(): void {
    if (this.running === 0) return;
    this.pending.push({ ticks: this.running, base: this.runningBase });
    this.running = 0;
  }

  private noteMultiplier(ctx: GameContext): void {
    this.best = Math.max(this.best, ctx.state.multiplier, this.lineMultiplier());
  }
}
