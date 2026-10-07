/**
 * The joint pickup and its chill effect: touching a joint sets
 * state.chillTimer to CHILL_DURATION and emits chillStart; while it runs the
 * scroll speed eases down to CHILL_SPEED_SCALE and back (core/chill.ts has the
 * timing) and the player jumps with CHILL_JUMP_SCALE (player/tuning.ts).
 */
import { CHILL_DURATION, chillStrength } from '../core/chill';
import type { GameContext } from '../types';
import { overlaps } from './rules';

/** Scroll speed factor at the height of the chill effect. */
export const CHILL_SPEED_SCALE = 0.6;

/** Factor on the difficulty speed for the remaining chill time (1 = no effect). */
export function chillSpeedFactor(chillTimer: number): number {
  return 1 - (1 - CHILL_SPEED_SCALE) * chillStrength(chillTimer);
}

/** Counts the chill effect down by one tick. */
export function countDownChill(ctx: GameContext, dt: number): void {
  ctx.state.chillTimer = Math.max(0, ctx.state.chillTimer - dt);
}

/** Picks up every joint the player touches (chillStart is emitted while the entity still exists). */
export function collectJoints(ctx: GameContext): void {
  const { state } = ctx;
  const body = state.player.hitbox;
  const picked = state.entities.filter((e) => e.kind === 'joint' && overlaps(body, e));
  for (const joint of picked) {
    state.chillTimer = CHILL_DURATION;
    ctx.bus.emit('chillStart', { entityId: joint.id, duration: CHILL_DURATION });
    state.entities.splice(state.entities.indexOf(joint), 1);
  }
}
