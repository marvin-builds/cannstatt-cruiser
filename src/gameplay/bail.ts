/**
 * Kickflip bail (ROADMAP 41): a kickflip still turning when the wheels touch
 * the street (the player reports the ticks it still needed in `land.flipLeft`)
 * is a bail, a crash like on any obstacle, once it is later than a short
 * grace. A rail or ledge catch is no `land` and never bails. Down still
 * held on the touchdown reads as a duck landing instead (down pressed late in
 * a jump to duck under a banner ahead starts a kickflip, too): no bail, but
 * the late flip scores nothing either way. Not while drunk: core delays every
 * release of down then (core/drunk.ts), so down is nearly always still held,
 * and the drunk spawner puts nothing overhead to duck under (ROADMAP 42).
 */
import type { GameContext } from '../types';
import { hurt } from './health';

/** Ticks a kickflip may still need on the touchdown tick without a bail. */
export const KICKFLIP_BAIL_GRACE_TICKS = 3;

/** The kickflip was too late for this landing (`flipLeft` from the `land` event). */
export function landedLate(flipLeft = 0): boolean {
  return flipLeft > KICKFLIP_BAIL_GRACE_TICKS;
}

/** Down still held on the touchdown reads as ducking under something, not as a flip (never while drunk). */
export function duckLanding(ctx: GameContext): boolean {
  return ctx.input.duck.held && ctx.state.drunkTimer <= 0;
}

/** The skater bails: one health, combo and carried item lost (ignored while invulnerable or already crashing). */
export function bail(ctx: GameContext): boolean {
  return hurt(ctx, -1, 'bail');
}
