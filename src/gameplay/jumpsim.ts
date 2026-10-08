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

export function groundBody(): Body {
  return { y: GROUND_Y, vy: 0, grounded: true, onRail: false, railTop: 0, railEnd: 0, boosting: false, boostTime: 0, ducking: false, bouncing: false };
}

export function railBody(railTop: number, railEnd: number): Body {
  return { ...groundBody(), y: railTop, grounded: false, onRail: true, railTop, railEnd };
}

/**
 * One tick of player movement at pattern x `px` (before this tick's scroll).
 * `press` is the action going down this tick, `held` whether it is down,
 * `duck` whether duck is held (it only counts on the ground, after a jump).
 * `jumpScale` scales the take-off speed (CHILL_JUMP_SCALE while chilled).
 */
export function stepBody(b: Body, px: number, press: boolean, held: boolean, duck = false, jumpScale = 1): Body {
  let { y, vy, grounded, onRail, boosting, boostTime } = b;
  if (!held) boosting = false;
  if (b.bouncing && !onRail) {
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
    if (px > b.railEnd) onRail = false;
    else y = b.railTop;
  } else if (!grounded) {
    const boosted = boosting && vy < 0 && boostTime < T.MAX_JUMP_HOLD;
    if (boosted) boostTime += TICK_DT;
    else boosting = false;
    vy = Math.min(T.MAX_FALL_SPEED, vy + (boosted ? T.HOLD_GRAVITY : T.GRAVITY) * TICK_DT);
    y += vy * TICK_DT;
    if (y >= GROUND_Y) {
      y = GROUND_Y;
      vy = 0;
      grounded = true;
    }
  }
  return { ...b, y, vy, grounded, onRail, boosting, boostTime, ducking: duck && grounded, bouncing: false };
}

/** The player's hitbox for this body at pattern x `px` (same shape as the player's own). */
export function hitboxOf(b: Body, px: number): Rect {
  const H = T.HITBOX_H;
  const h = b.ducking ? H.ducking : b.grounded || b.onRail ? H.standing : H.tucked;
  return { x: px - T.HITBOX_W / 2, y: b.y - h, w: T.HITBOX_W, h };
}

/** Puts the body onto a rail (what grindStart does to the player). */
export function snapToRail(b: Body, railTop: number, railEnd: number): Body {
  return { ...b, y: railTop, vy: 0, grounded: false, onRail: true, railTop, railEnd, boosting: false };
}

/** What the stomp event does to the player: it bounces up with STOMP_BOUNCE_VELOCITY on the next step. */
export function stompBody(b: Body): Body {
  return { ...b, bouncing: true };
}
