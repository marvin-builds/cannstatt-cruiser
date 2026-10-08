/**
 * A branchable copy of the skater's movement (src/player/controller.ts, numbers
 * from src/player/tuning.ts) for the clearability solver: ground, variable
 * jump (take-off scaled by CHILL_JUMP_SCALE while chilled), ducking (on the
 * ground only), riding a rail and rolling off its end, and the stomp bounce. Jump buffer, coyote
 * time and crashes are left out, which only makes the solver more conservative.
 * jumpsim.test.ts checks it against the real player tick by tick.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import type { Rect } from '../types';
import * as T from '../player/tuning';

export interface Body {
  readonly y: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly onRail: boolean;
  /** Top of the ridden rail (valid while onRail). */
  readonly railTop: number;
  /** Pattern x where the ridden rail ends (valid while onRail). */
  readonly railEnd: number;
  readonly boosting: boolean;
  readonly boostTime: number;
  /** Ducked on the ground (low hitbox). */
  readonly ducking: boolean;
  /** A stomp was reported: the next step bounces (see stompBody). */
  readonly bouncing: boolean;
}

/** A Body the solver steps in place (stepBodyInto), so its flights allocate nothing per tick. */
export type MutableBody = { -readonly [K in keyof Body]: Body[K] };

export function groundBody(): Body {
  return { y: GROUND_Y, vy: 0, grounded: true, onRail: false, railTop: 0, railEnd: 0, boosting: false, boostTime: 0, ducking: false, bouncing: false };
}

export function railBody(railTop: number, railEnd: number): Body {
  return { ...groundBody(), y: railTop, grounded: false, onRail: true, railTop, railEnd };
}

/** A fresh copy of a body (same fields, same order). */
export function copyBody(b: Body): MutableBody {
  return copyInto({} as MutableBody, b);
}

/** Copies every field of `b` into `out`; returns `out`. */
export function copyInto(out: MutableBody, b: Body): MutableBody {
  out.y = b.y;
  out.vy = b.vy;
  out.grounded = b.grounded;
  out.onRail = b.onRail;
  out.railTop = b.railTop;
  out.railEnd = b.railEnd;
  out.boosting = b.boosting;
  out.boostTime = b.boostTime;
  out.ducking = b.ducking;
  out.bouncing = b.bouncing;
  return out;
}

/**
 * One tick of player movement at pattern x `px` (before this tick's scroll).
 * `press` is the action going down this tick, `held` whether it is down,
 * `duck` whether duck is held (it only counts on the ground, after a jump).
 * `jumpScale` scales the take-off speed (CHILL_JUMP_SCALE while chilled).
 */
export function stepBody(b: Body, px: number, press: boolean, held: boolean, duck = false, jumpScale = 1): Body {
  return stepBodyInto(copyBody(b), b, px, press, held, duck, jumpScale);
}

/** stepBody written into `out` (which may be `b` itself); returns `out`. */
export function stepBodyInto(out: MutableBody, b: Body, px: number, press: boolean, held: boolean, duck = false, jumpScale = 1): MutableBody {
  let { y, vy, grounded, onRail, boosting, boostTime } = b;
  const { railTop, railEnd, bouncing } = b;
  if (!held) boosting = false;
  if (bouncing && !onRail) {
    // Like a take-off with the action already released: normal gravity, no hold boost.
    grounded = false;
    boosting = false;
    vy = -T.STOMP_BOUNCE_VELOCITY;
  }
  if (press && (grounded || onRail)) {
    onRail = false;
    grounded = false;
    boosting = true;
    boostTime = 0;
    vy = -T.JUMP_VELOCITY * jumpScale;
  }
  if (onRail) {
    if (px > railEnd) onRail = false;
    else y = railTop;
  } else if (!grounded) {
    const boosted = boosting && vy < 0 && boostTime < T.MAX_JUMP_HOLD;
    if (boosted) boostTime += TICK_DT;
    else boosting = false;
    vy = Math.min(T.MAX_FALL_SPEED, vy + (boosted ? T.HOLD_GRAVITY : T.GRAVITY) * TICK_DT);
    y += vy * TICK_DT;
    if (y >= GROUND_Y) {
      vy = 0;
      grounded = true;
    }
    // Clamped with Math.min, not `y = GROUND_Y`: bundled module constants are `var`s, and merging
    // one into the float y made V8 box y in a fresh heap number on every simulated tick.
    y = Math.min(y, GROUND_Y);
  }
  out.y = y;
  out.vy = vy;
  out.grounded = grounded;
  out.onRail = onRail;
  out.railTop = railTop;
  out.railEnd = railEnd;
  out.boosting = boosting;
  out.boostTime = boostTime;
  out.ducking = duck && grounded;
  out.bouncing = false;
  return out;
}

/** The player's hitbox for this body at pattern x `px` (same shape as the player's own). */
export function hitboxOf(b: Body, px: number): Rect {
  return hitboxInto(b, px, { x: 0, y: 0, w: 0, h: 0 });
}

/** hitboxOf written into `out` (the solver's inner loop allocates nothing for it); returns `out`. */
export function hitboxInto(b: Body, px: number, out: Rect): Rect {
  const H = T.HITBOX_H;
  const h = b.ducking ? H.ducking : b.grounded || b.onRail ? H.standing : H.tucked;
  out.x = px - T.HITBOX_W / 2;
  out.y = b.y - h;
  out.w = T.HITBOX_W;
  out.h = h;
  return out;
}

/** Puts the body onto a rail (what grindStart does to the player). */
export function snapToRail(b: Body, railTop: number, railEnd: number): Body {
  return snapToRailInto(copyBody(b), railTop, railEnd);
}

/** snapToRail in place; returns `b`. */
export function snapToRailInto(b: MutableBody, railTop: number, railEnd: number): MutableBody {
  b.y = railTop;
  b.vy = 0;
  b.grounded = false;
  b.onRail = true;
  b.railTop = railTop;
  b.railEnd = railEnd;
  b.boosting = false;
  return b;
}

/** What the stomp event does to the player: it bounces up with STOMP_BOUNCE_VELOCITY on the next step. */
export function stompBody(b: Body): Body {
  return stompInto(copyBody(b));
}

/** stompBody in place; returns `b`. */
export function stompInto(b: MutableBody): MutableBody {
  b.bouncing = true;
  return b;
}
