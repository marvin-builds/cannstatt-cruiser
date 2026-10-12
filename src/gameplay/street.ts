/**
 * What the skater has to react to on the street (ROADMAP 52: no long quiet
 * stretches): obstacles (people and overhead signs too), rails, stars, kickers
 * (press or skip), the joint and the high fiver. A stunt ledge is the upper
 * level, not the street, and so are the stars above its deck. Shared by the
 * spawner (the gap after a pattern) and the quiet-time measure.
 */
import { GROUND_Y } from '../core/config';
import type { EntityKind, Rect } from '../types';
import { isKicker, isLedge, isObstacle, isRail, starRect, STAR_SIZE } from './catalogue';
import type { Piece } from './course';

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

/** Height of a quiet street star's centre above the street: taken by riding through, standing or ducked. */
const RIDING_STAR_LIFT = 12;

/**
 * A street threat also a pixel to either side: a star touching a ledge's end
 * is upper level or not by a rounding hair on the live street (float x), so
 * quietStreetStars does not count on it.
 */
function surelyThreat(p: Piece, all: readonly Piece[]): boolean {
  return isStreetThreat(p, all) && (p.kind !== 'star' || isStreetThreat({ ...p, x: p.x - 1, w: p.w + 2 }, all));
}

/**
 * Stars at riding height that split every stretch between two street
 * threats among `pieces` longer than `longest` px (the spawner's quiet cap,
 * for the street under a stunt line, whose upper level and gap jumps leave
 * it empty). Evenly spread, no rng draw, never part of an arc; a skater on
 * the ledges above passes over them.
 */
export function quietStreetStars(pieces: readonly Piece[], longest: number): Piece[] {
  const threats = pieces.filter((p) => surelyThreat(p, pieces)).sort((a, b) => a.x - b.x);
  const stars: Piece[] = [];
  /** Right end of the threats so far (null before the first). */
  let end: number | null = null;
  for (const t of threats) {
    const room = end === null ? 0 : t.x - end;
    if (end !== null && room > longest) {
      const count = Math.ceil((room + STAR_SIZE) / (longest + STAR_SIZE)) - 1;
      for (let i = 1; i <= count; i++) stars.push({ kind: 'star', ...starRect(end + (i * room) / (count + 1), GROUND_Y - RIDING_STAR_LIFT) });
    }
    end = Math.max(end ?? -Infinity, t.x + t.w);
  }
  return stars;
}
