/**
 * Contact rules shared by the live collision code and the clearability
 * solver, so both judge a crash or a rail landing identically.
 */
import { TICK_DT } from '../core/config';
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
 * Stomp: the falling feet came down onto the top edge of `head` this tick
 * (from above, crossing `head.y`) while the body is over it. Rising into a
 * person, or touching it from the side, is not a stomp but a crash.
 */
export function landsOnHead(feet: Feet, body: Rect, head: Rect): boolean {
  if (feet.supported || feet.vy <= 0) return false;
  const before = feet.y - feet.vy * TICK_DT;
  return before <= head.y && feet.y >= head.y && body.x < head.x + head.w && head.x < body.x + body.w;
}
