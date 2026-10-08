/**
 * Contact rules shared by the live collision code and the clearability
 * solver, so both judge a crash or a rail landing identically.
 */
import { TICK_DT } from '../core/config';
import { HITBOX_W } from '../player/tuning';
import type { PlayerState, Rect } from '../types';

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

const scratchFeet: Feet = { x: 0, y: 0, vy: 0, supported: false };

/** The live player's feet this tick, in one shared scratch object (read it before the next call). */
export function feetOf(p: PlayerState): Feet {
  scratchFeet.x = p.x;
  scratchFeet.y = p.y;
  scratchFeet.vy = p.vy;
  scratchFeet.supported = p.grounded || p.grinding;
  return scratchFeet;
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
  scratchLedge.x = top.x - LEDGE_FRONT_REACH;
  scratchLedge.y = top.y;
  scratchLedge.w = top.w + LEDGE_FRONT_REACH;
  scratchLedge.h = top.h;
  return landsOnRail(feet, scratchLedge);
}

/** landsOnLedge's widened top (the solver asks millions of times; never kept). */
const scratchLedge: Rect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * The board (wheel contact x) is past the ledge's rear end: it got there over
 * the top, so only the body's rear can still overlap the ledge's box, which
 * is no crash (landing behind a bench, or rolling off its end).
 */
export function pastLedge(feetX: number, top: Rect): boolean {
  return feetX > top.x + top.w;
}

/** How far below the top of a person's box the stomp zone reaches: head and shoulders. */
export const STOMP_DEPTH = 8;
/** Least reach of the stomp zone beside the head (px, each side). */
export const STOMP_MIN_REACH = 4;
/**
 * Take-off ticks the stomp zone spans horizontally (skater's hitbox plus the
 * widened head) at any speed: the zone grows with the scroll step, so the
 * stomp window in ticks stays about the same when the street gets faster.
 */
export const STOMP_SPAN_TICKS = 16;

/** How far beside the head (px, each side) the stomp zone reaches at `step` px of scroll per tick. */
export function stompReach(step: number, headW = 6): number {
  return Math.max(STOMP_MIN_REACH, (STOMP_SPAN_TICKS * step - HITBOX_W - headW) / 2);
}

/**
 * Stomp: the falling skater's board is in the person's stomp zone, its head
 * and shoulders (STOMP_DEPTH below the top of `head`, the person's box) widened
 * by stompReach on both sides; `step` is the scroll per tick. So coming down
 * slightly beside the head, or touching the upper body from the side while
 * descending, stomps too. Rising into a person, or running into one lower
 * (on the ground), is still a crash.
 */
export function landsOnHead(feet: Feet, body: Rect, head: Rect, step: number): boolean {
  if (feet.supported || feet.vy <= 0 || feet.y < head.y || feet.y > head.y + STOMP_DEPTH) return false;
  const reach = stompReach(step, head.w);
  return body.x < head.x + head.w + reach && head.x - reach < body.x + body.w;
}
