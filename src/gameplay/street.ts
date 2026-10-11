/**
 * What the skater has to react to on the street (ROADMAP 52: no long quiet
 * stretches): obstacles (people and overhead signs too), rails, stars, kickers
 * (press or skip), the joint and the high fiver. A stunt ledge is the upper
 * level, not the street, and so are the stars above its deck. Shared by the
 * spawner (the gap after a pattern) and the quiet-time measure.
 */
import type { EntityKind, Rect } from '../types';
import { isKicker, isLedge, isObstacle, isRail } from './catalogue';

type Placed = Rect & { kind: EntityKind };

/** A star above a stunt ledge's deck belongs to the upper level. */
function onUpperLevel(star: Placed, all: readonly Placed[]): boolean {
  return all.some((l) => isLedge(l.kind) && l.x < star.x + star.w && star.x < l.x + l.w && star.y + star.h <= l.y + l.h);
}

/** `p` (one of `all`, pattern pieces or live entities) is something on the street to react to. */
export function isStreetThreat(p: Placed, all: readonly Placed[]): boolean {
  if (isObstacle(p.kind) || isRail(p.kind) || isKicker(p.kind)) return true;
  if (p.kind === 'joint' || p.kind === 'highFiver') return true;
  return p.kind === 'star' && !onUpperLevel(p, all);
}

/** Right end of the last street threat among `pieces` (0 when there is none). */
export function lastThreatEnd(pieces: readonly Placed[]): number {
  let end = 0;
  for (const p of pieces) if (isStreetThreat(p, pieces)) end = Math.max(end, p.x + p.w);
  return end;
}
