/**
 * Air trick scoring (Stunt Wave B, ROADMAP 41). The player system sets
 * player.airTrick while its kickflip runs; gameplay only reads it (the trick
 * never changes the physics, so jumpsim and the solver know nothing of it).
 *
 * - A trick runs while the flag is set and the skater is in the air; it ends
 *   when the flag goes back to false or the skater touches down (a rail or
 *   ledge catch cuts it short: it still counts, with the ticks it ran).
 * - Ended tricks wait for the next clean touchdown: a street landing (`land`)
 *   or a grind start on a rail, bench or ledge (`grindStart`). At the end of
 *   that tick each one emits `airTrick {ticks, points, full}` once.
 * - A crash before or on the touchdown tick drops them, and so does a landing
 *   with the flip too late (bail.ts): nothing is awarded.
 * - Base: AIR_TRICK_POINTS for a launch kickflip (a kicker launched the
 *   skater since his last touchdown, event `launch`). A street kickflip (any
 *   other flight) gets STREET_AIR_TRICK_POINTS only when the same flight
 *   cleared an obstacle or stomped someone (between take-off and touchdown),
 *   otherwise the small EMPTY_AIR_TRICK_POINTS (a reason to flip).
 * - Repetition fade (flip-fade.ts): the base times the share for the n-th
 *   kickflip in a row (rounded). An obstacle cleared, a stomp, a grind start,
 *   a launch or a high five (refresh) make the next one full again. `full`
 *   is false when the empty-air base or the fade cut the points.
 * - Points: that times the best multiplier seen from the trick to its
 *   touchdown, the normal combo multiplier or, inside a running stunt line,
 *   the line's multiplier when that is higher. The trick is no line piece: it
 *   adds no stuntStep and never ends or extends a line. Gameplay never gates
 *   the trick: whatever the player's start rule (player/air-trick.ts) lets
 *   run is scored.
 */
import type { GameContext } from '../types';
import { KickflipFade } from './flip-fade';
import { addBonus } from './scoring';

/** Base points of a launch kickflip (times the multiplier). */
export const AIR_TRICK_POINTS = 150;
/** Base points of a street kickflip in a flight that cleared an obstacle or stomped someone (times the multiplier). */
export const STREET_AIR_TRICK_POINTS = 100;
/** Base points of a street kickflip into empty air (times the multiplier). */
export const EMPTY_AIR_TRICK_POINTS = 20;

/** A trick that ended and waits for a clean touchdown. */
interface EndedTrick {
  ticks: number;
  launched: boolean;
}

export class AirTrickScore {
  /** Ticks of the trick running now (0: none). */
  private running = 0;
  /** The running trick started in a launch flight. */
  private runningLaunched = false;
  /** A kicker launched the skater since his last touchdown. */
  private launchedFlight = false;
  /** This flight cleared an obstacle or stomped someone. */
  private earnedFlight = false;
  private readonly fade = new KickflipFade();
  private readonly pending: EndedTrick[] = [];
  private best = 1;
  private touched = false;
  private dropped = false;

  /** @param lineMultiplier the running stunt line's multiplier (1 without a line). */
  constructor(private readonly lineMultiplier: () => number) {}

  reset(): void {
    this.running = 0;
    this.pending.length = 0;
    this.best = 1;
    this.touched = false;
    this.dropped = false;
    this.launchedFlight = false;
    this.earnedFlight = false;
    this.fade.reset();
  }

  /** A kicker launched the skater (event `launch`): tricks until the next touchdown are launch kickflips. */
  launched(): void {
    this.launchedFlight = true;
    this.fade.refresh();
  }

  /** The skater took off from the street (event `jump`): a new flight that has earned nothing yet. */
  tookOff(): void {
    this.earnedFlight = false;
  }

  /** An obstacle was cleared or someone stomped (obstacleCleared, stomp): street flips of this flight pay their full base. */
  cleared(): void {
    this.earnedFlight = true;
    this.fade.refresh();
  }

  /** Something else than a kickflip happened (a grind start, a high five): the next kickflip pays full. */
  refresh(): void {
    this.fade.refresh();
  }

  /** Every playing tick, after the player and before the contacts. */
  update(ctx: GameContext, dt: number): void {
    const p = ctx.state.player;
    if (p.airTrick && !p.grounded && !p.grinding && p.state !== 'crash') this.run();
    else this.endRunning();
    const flipping = this.running > 0 || this.pending.length > 0;
    this.fade.update(dt, flipping);
    if (flipping) this.noteMultiplier(ctx);
  }

  /** The skater touched down cleanly (land, grindStart). */
  touchedDown(): void {
    this.touched = true;
    this.launchedFlight = false;
  }

  /** A crash, or a landing with the flip too late: the running and waiting tricks award nothing. */
  drop(): void {
    this.dropped = true;
    this.running = 0;
    this.pending.length = 0;
  }

  /** At the end of every playing tick: award the waiting tricks after a clean touchdown this tick. */
  settle(ctx: GameContext): void {
    if (this.touched) {
      this.endRunning();
      if (!this.dropped && ctx.state.player.state !== 'crash') this.award(ctx);
      this.pending.length = 0;
      this.earnedFlight = false;
    }
    if (this.running === 0 && this.pending.length === 0) this.best = 1;
    this.touched = false;
    this.dropped = false;
  }

  private award(ctx: GameContext): void {
    this.noteMultiplier(ctx);
    for (const { ticks, launched } of this.pending) {
      const base = launched ? AIR_TRICK_POINTS : this.earnedFlight ? STREET_AIR_TRICK_POINTS : EMPTY_AIR_TRICK_POINTS;
      const share = this.fade.next();
      const points = addBonus(ctx.state, ctx.bus, Math.round(base * share) * this.best);
      ctx.bus.emit('airTrick', { ticks, points, full: base !== EMPTY_AIR_TRICK_POINTS && share === 1 });
    }
  }

  private run(): void {
    if (this.running === 0) this.runningLaunched = this.launchedFlight;
    this.running++;
  }

  private endRunning(): void {
    if (this.running === 0) return;
    this.pending.push({ ticks: this.running, launched: this.runningLaunched });
    this.running = 0;
  }

  private noteMultiplier(ctx: GameContext): void {
    this.best = Math.max(this.best, ctx.state.multiplier, this.lineMultiplier());
  }
}
