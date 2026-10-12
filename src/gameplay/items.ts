/**
 * The items people carry and toss on a stomp: VfB fans (and the e-scooter rider, hazards.ts) a football, Wasen
 * visitors (by their `data.prop`) a Maßkrug or a Brezel; in kid mode the
 * Maßkrug becomes a Lebkuchenherz, so kid mode never shows beer. Wasen
 * visitors of a fan crowd (crowd.ts) wear Lebkuchenherzen and toss one, in
 * every mode: a crowd never hands out beer.
 *
 * Scarcer healing late in a run (ROADMAP 52 point 8): in adult mode the
 * share of Wasen visitors holding a Brezel (the healing loot outside kid mode)
 * ramps from HEAL_SHARE down to LATE_HEAL_SHARE between
 * LATE_HEAL_FROM_SECONDS and LATE_HEAL_FULL_SECONDS of riding, so mistakes
 * cost more while the street stays as fair; the others hold a Maßkrug. Kid
 * mode keeps HEAL_SHARE (there every visitor's item heals anyway). The
 * spawner turns its street distance into the ramp's progress (spawner.ts).
 * Fan crowds keep their Lebkuchenherzen (rare, at most one per visit).
 */
import type { Rng } from '../core/rng';
import type { CarriedItem, Entity, EntityKind } from '../types';
import { crowdOf } from './crowd-tag';

/** Number of props a Wasen visitor can hold (`data.prop` 0..PROPS-1). */
export const PROPS = 2;
/** The prop of a Wasen visitor holding a Brezel (the other one: the Maßkrug, a Lebkuchenherz in kid mode). */
const BREZEL_PROP = 1;
/** Share of Wasen visitors holding a Brezel early in a run (and always in kid mode): one prop of PROPS. */
export const HEAL_SHARE = 1 / PROPS;
/** Share of Wasen visitors holding a Brezel once healing has become scarce (adult mode): half of HEAL_SHARE. */
export const LATE_HEAL_SHARE = HEAL_SHARE / 2;
/** Seconds of riding from which the Brezel share starts to drop (adult mode). */
export const LATE_HEAL_FROM_SECONDS = 180;
/** Seconds of riding from which the Brezel share is down to LATE_HEAL_SHARE (a one-minute ramp). */
export const LATE_HEAL_FULL_SECONDS = 240;

/** Bonus points for catching the tossed item (times the multiplier). */
export const ITEM_POINTS = 200;

export function itemOf(e: { kind: EntityKind; data?: Entity['data'] }, kidMode: boolean): CarriedItem {
  if (e.kind === 'vfbFan') return 'football';
  if (crowdOf(e) === 'wasen') return 'gingerbread';
  const prop = Number(e.data?.prop ?? 0) % PROPS;
  if (prop === BREZEL_PROP) return 'pretzel';
  return kidMode ? 'gingerbread' : 'beer';
}

/**
 * Share of Wasen visitors holding a Brezel at `late`, the progress through
 * the late-healing ramp (0 before LATE_HEAL_FROM_SECONDS of riding, 1 from
 * LATE_HEAL_FULL_SECONDS on, linear in between).
 */
export function brezelShare(late: number, kidMode: boolean): number {
  if (kidMode) return HEAL_SHARE;
  const t = Math.min(1, Math.max(0, late));
  return HEAL_SHARE + (LATE_HEAL_SHARE - HEAL_SHARE) * t;
}

/** A Wasen visitor's prop: the Brezel with chance `share`, from one rng draw (at HEAL_SHARE the same as rng.int(0, PROPS - 1)). */
export function drawProp(rng: Rng, share: number): number {
  return rng.next() >= 1 - share ? BREZEL_PROP : 0;
}
