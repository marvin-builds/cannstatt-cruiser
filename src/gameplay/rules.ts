/**
 * Contact rules shared by the live collision code and the clearability
 * solver, so both judge a crash or a rail landing identically.
 */
import { TICK_DT } from '../core/config';
import { HITBOX_W } from '../player/tuning';
import type { Rect } from '../types';

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** What gameplay needs to know about the player's feet this tick. */
export interface Feet {
  /** Wheel contact x (same space as the rail). */
  x: number;
  y: number;
  vy: number;
  supported: boolean;
}

/**
 * The feet came down onto the rail's top edge this tick: falling, the wheels
 * crossed `rail.y` (from the y before this tick's move) and are over the rail.
 */
export function landsOnRail(feet: Feet, rail: Rect): boolean {
  if (feet.supported || feet.vy < 0) return false;
  const before = feet.y - feet.vy * TICK_DT;
  return before <= rail.y && feet.y >= rail.y && feet.x >= rail.x && feet.x <= rail.x + rail.w;
}

/**
 * How far before a ledge's (bench's) start the feet may come down and still
 * grind it: the body already reaches over its front corner.
 */
export const LEDGE_FRONT_REACH = HITBOX_W / 2;

/**
 * The feet came down onto a ledge's top edge this tick (see landsOnRail),
 * anywhere from its front corner (LEDGE_FRONT_REACH before it) to its rear
 * end. Coming down further back is no grind but a landing behind it
 * (pastLedge).
 */
export function landsOnLedge(feet: Feet, top: Rect): boolean {
  return landsOnRail(feet, { ...top, x: top.x - LEDGE_FRONT_REACH, w: top.w + LEDGE_FRONT_REACH });
}

/**
 * The board (wheel contact x) is past the ledge's rear end: it got there over
 * the top, so only the body's rear can still overlap the ledge's box, which
 * is no crash (landing behind a bench, or rolling off its end).
 */
export function pastLedge(feetX: number, top: Rect): boolean {
  return feetX > top.x + top.w;
}

/**
 * Stomp: the falling feet came down onto the top edge of `head` this tick
 * (from above, crossing `head.y`) while the body is over it. Rising into a
 * person, or touching it from the side, is not a stomp but a crash.
 */
export function landsOnHead(feet: Feet, body: Rect, head: Rect): boolean {
  if (feet.supported || feet.vy <= 0) return false;
  const before = feet.y - feet.vy * TICK_DT;
  return before <= head.y && feet.y >= head.y && body.x < head.x + head.w && head.x < body.x + body.w;
}
