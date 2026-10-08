/**
 * The NorDIY park session (ROADMAP 36) along `state.park` (planned by the
 * spawner, park-line.ts; or set by the debug hook): the crowd cheers for
 * every grind trick, air trick and stunt combo step inside [start, end)
 * (`sessionCheer`, the level rising by CHEER_STEP up to 1); when the skater
 * passes `end` the "Session!" bonus (`sessionEnd`, SESSION_MAX_POINTS times
 * the level, 0 without a trick) is added to the score. Once `end` is
 * PARK_CLEAR_AFTER behind the skater (the scenery has left every screen)
 * `state.park` is cleared.
 *
 * Run distances: a park distance d reaches the skater (PLAYER_X) when
 * `state.distance` gets to d.
 */
import { VIEW_MAX_W } from '../core/config';
import type { GameContext, ParkPlan } from '../types';
import { addBonus } from './scoring';

/** Cheering per trick in the park (0..1). */
export const CHEER_STEP = 0.2;
/** The "Session!" bonus at full cheering. */
export const SESSION_MAX_POINTS = 500;
/** `state.park` is cleared when its end is this far behind the skater: off the widest screen. */
export const PARK_CLEAR_AFTER = VIEW_MAX_W;

export class ParkSession {
  private level = 0;
  /** The plan the level belongs to. */
  private current: ParkPlan | null = null;
  /** The plan whose session already ended (its bonus is paid). */
  private ended: ParkPlan | null = null;

  reset(): void {
    this.level = 0;
    this.current = null;
    this.ended = null;
  }

  /** The skater is inside the planned park now. */
  inside(ctx: GameContext): boolean {
    const park = ctx.state.park;
    return park !== null && park !== this.ended && ctx.state.distance >= park.start && ctx.state.distance < park.end;
  }

  /** A trick (grind trick, air trick, stunt step): the crowd cheers if it was inside the park. */
  trick(ctx: GameContext): void {
    if (!this.inside(ctx)) return;
    if (this.current !== ctx.state.park) {
      this.current = ctx.state.park;
      this.level = 0;
    }
    this.level = Math.min(1, Math.round((this.level + CHEER_STEP) * 1000) / 1000);
    ctx.bus.emit('sessionCheer', { level: this.level });
  }

  /** Every playing tick: ends the session past `end`, clears the plan once it left the screen. */
  update(ctx: GameContext): void {
    const { state } = ctx;
    const park = state.park;
    if (!park) return;
    if (park !== this.ended && state.distance >= park.end) {
      const level = this.current === park ? this.level : 0;
      const points = Math.round(SESSION_MAX_POINTS * level);
      addBonus(state, ctx.bus, points);
      ctx.bus.emit('sessionEnd', { level, points });
      this.ended = park;
      this.level = 0;
    }
    if (state.distance >= park.end + PARK_CLEAR_AFTER) state.park = null;
  }
}
