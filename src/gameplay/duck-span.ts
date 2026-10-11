/**
 * The touch duck limit (ROADMAP 66). On a phone a swipe down ducks for a
 * fixed SWIPE_DUCK_TICKS (core/input.ts) and then stands up by itself; a tap
 * (a jump) ends it early. The solver plans a duck held as long as needed (the
 * keyboard), so the planner also checks the street against the swipe:
 *
 * - a **duck group** is a run of overhead signs ducked under in one go: the
 *   next sign joins the group when its duck zone starts less than
 *   DUCK_REPEAT_SECONDS after the group's first one (a swipe for the first
 *   sign is still running or the player is just standing up), unless a
 *   ground obstacle (or person) lies between them, which has to be jumped,
 *   and the jump ends the duck (a new swipe follows after the landing);
 * - one go, from entering the first sign's duck zone to leaving the last
 *   (plus DUCK_TRANSITION), lasts at most ONE_GO_DUCK_SECONDS at every speed
 *   the pattern is ridden at, with margin below the swipe for a swipe a
 *   little early;
 * - so between two groups there is at least MIN_STAND_UP_SECONDS of street
 *   after the longest group: the swipe runs out, the skater stands up, and
 *   the player sees it and swipes again (STAND_UP_SECONDS).
 *
 * A second swipe while ducking would restart the swipe's timer (input.ts),
 * but a player who does not know that must not need it. patterns.ts rejects
 * a pattern whose groups break the limit (also across the boundary to the
 * previous pattern); mixes.ts lays at most MAX_ONE_GO_SIGNS signs per group.
 */
import { TICK_DT } from '../core/config';
import { SWIPE_DUCK_TICKS } from '../core/input';
import { DUCK_TRANSITION, HITBOX_W } from '../player/tuning';
import type { ObstacleKind, Rect } from '../types';
import { hitBox, isObstacle, isOverhead } from './catalogue';
import type { Piece } from './course';
import { SAFETY } from './solver';

/** How long a swipe down ducks (core/input.ts SWIPE_DUCK_TICKS). */
export const SWIPE_DUCK_SECONDS = SWIPE_DUCK_TICKS * TICK_DT;
/** The longest duck the street asks for in one go (incl. DUCK_TRANSITION): 0.2 s below the swipe, so a swipe up to ~0.2 s early still holds. */
export const ONE_GO_DUCK_SECONDS = 1.0;
/** Seconds to see the skater stand up after a swipe ran out and to swipe again. */
export const STAND_UP_SECONDS = 0.3;
/** The least time from one duck group's first duck zone to the next group's (no jump between): the swipe, then a stand-up. */
export const DUCK_REPEAT_SECONDS = SWIPE_DUCK_SECONDS + STAND_UP_SECONDS;
/** The least free street (seconds) after the longest one-go group before the next group starts. */
export const MIN_STAND_UP_SECONDS = DUCK_REPEAT_SECONDS - ONE_GO_DUCK_SECONDS;
/** Signs ducked in one go at most (mixes.ts chains lay no more). */
export const MAX_ONE_GO_SIGNS = 2;

/** Overheads ducked under in one go: the feet x range in which the skater has to be ducked. */
export interface DuckGroup {
  from: number;
  to: number;
  signs: number;
  /** Pattern x of the last sign in the group. */
  lastX: number;
}

/** The feet x range in which a standing hitbox overlaps an overhead's box (grown by the solver's SAFETY). */
export function duckZone(box: Rect): { from: number; to: number } {
  return { from: box.x - SAFETY - HITBOX_W / 2, to: box.x + box.w + SAFETY + HITBOX_W / 2 };
}

const boxOf = (p: Piece) => hitBox({ kind: p.kind as ObstacleKind, x: p.x, y: p.y });

/** The duck groups of `pieces` at `speed` (px/s), in street order (see the module comment). */
export function duckGroups(pieces: readonly Piece[], speed: number): DuckGroup[] {
  const signs = pieces.filter((p) => isOverhead(p.kind)).sort((a, b) => a.x - b.x);
  const jumps = pieces.filter((p) => isObstacle(p.kind) && !isOverhead(p.kind)).map(boxOf);
  const repeat = DUCK_REPEAT_SECONDS * speed;
  const groups: DuckGroup[] = [];
  let group: DuckGroup | null = null;
  let prev: Rect | null = null;
  for (const sign of signs) {
    const box = boxOf(sign);
    const zone = duckZone(box);
    const jumped = prev !== null && jumps.some((j) => j.x >= prev!.x + prev!.w && j.x + j.w <= box.x);
    if (group && !jumped && zone.from - group.from < repeat) {
      group.to = Math.max(group.to, zone.to);
      group.signs++;
      group.lastX = sign.x;
    } else {
      group = { ...zone, signs: 1, lastX: sign.x };
      groups.push(group);
    }
    prev = box;
  }
  return groups;
}

/** Seconds a group is ducked in one go at `speed`, incl. the duck transition. */
export function oneGoSeconds(group: DuckGroup, speed: number): number {
  return (group.to - group.from) / speed + DUCK_TRANSITION;
}

/** The longest one go (seconds) at `speed` among the groups whose last sign lies at x >= `from` (0 when there is none). */
export function longestOneGo(pieces: readonly Piece[], speed: number, from = -Infinity): number {
  return Math.max(0, ...duckGroups(pieces, speed).filter((g) => g.lastX >= from).map((g) => oneGoSeconds(g, speed)));
}

/**
 * Whether a player who ducks by swiping gets through `pieces` at every one
 * of `speeds`: no group reaching x >= `from` (the new pattern; the previous
 * one's own groups were checked with it) is longer than ONE_GO_DUCK_SECONDS
 * or has more than MAX_ONE_GO_SIGNS signs.
 */
export function touchDuckable(pieces: readonly Piece[], speeds: readonly number[], from = -Infinity): boolean {
  return speeds.every((speed) =>
    duckGroups(pieces, speed).every((g) => g.lastX < from || (g.signs <= MAX_ONE_GO_SIGNS && oneGoSeconds(g, speed) <= ONE_GO_DUCK_SECONDS)),
  );
}
