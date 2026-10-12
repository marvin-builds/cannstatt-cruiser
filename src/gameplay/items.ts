/**
 * The items people carry and toss on a stomp: VfB fans (and the e-scooter rider, hazards.ts) a football, Wasen
 * visitors (by their `data.prop`) a Maßkrug or a Brezel; in kid mode the
 * Maßkrug becomes a Lebkuchenherz, so kid mode never shows beer. Wasen
 * visitors of a fan crowd (crowd.ts) wear Lebkuchenherzen and toss one, in
 * every mode: a crowd never hands out beer.
 */
import type { CarriedItem, Entity, EntityKind } from '../types';
import { crowdOf } from './crowd-tag';

/** Number of props a Wasen visitor can hold (`data.prop` 0..PROPS-1). */
export const PROPS = 2;

/** Bonus points for catching the tossed item (times the multiplier). */
export const ITEM_POINTS = 200;

export function itemOf(e: { kind: EntityKind; data?: Entity['data'] }, kidMode: boolean): CarriedItem {
  if (e.kind === 'vfbFan') return 'football';
  if (crowdOf(e) === 'wasen') return 'gingerbread';
  const prop = Number(e.data?.prop ?? 0) % PROPS;
  if (prop === 1) return 'pretzel';
  return kidMode ? 'gingerbread' : 'beer';
}
