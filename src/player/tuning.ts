/**
 * Every tunable of the skater in one place (view pixels, seconds).
 * Jump numbers give: tap (1-2 ticks) apex ~15-17 px, full hold apex ~52 px.
 */

/** Upward speed at take-off. */
export const JUMP_VELOCITY = 190;
/** Normal gravity (falling, or rising after the action was released). */
export const GRAVITY = 1300;
/** Gravity while the action is still held during the rise (the high jump). */
export const HOLD_GRAVITY = 250;
/** Holding longer than this adds no more height. */
export const MAX_JUMP_HOLD = 0.33;
/** Terminal fall speed. */
export const MAX_FALL_SPEED = 600;

/** A jump is still allowed this long after rolling off a rail end. */
export const COYOTE_TIME = 0.08;
/** A press this long before touching down still jumps on touch-down. */
export const JUMP_BUFFER = 0.12;

/** Seconds of the ollie pose (crouch -> pop) after take-off before the air pose. */
export const OLLIE_TIME = 0.12;
/** Seconds of the crouch shown when ducking down and when standing up again (looks only). */
export const DUCK_TRANSITION = 0.06;
/** Seconds of the landing squash. */
export const LAND_TIME = 0.15;

/** Ride/push rhythm on the ground: a push of PUSH_TIME every PUSH_PERIOD seconds. */
export const PUSH_PERIOD = 3.2;
export const PUSH_TIME = 1.0;

/** Crash: stumble/tumble/get-up animation length; input is ignored meanwhile. */
export const CRASH_TIME = 1.0;
/** Upward speed of the hop when thrown off the board. */
export const CRASH_HOP_VELOCITY = 110;
/** Invulnerability after a crash (blinks once the get-up animation is over). */
export const INVULNERABLE_TIME = 1.5;
/** Blink period (seconds per on/off pair) during invulnerability. */
export const BLINK_PERIOD = 0.13;

/** Hitbox width (centred on player.x): body only, not the long deck. */
export const HITBOX_W = 10;
/** Hitbox height above the wheel contact point, per pose (slightly below the cap top). */
export const HITBOX_H = {
  standing: 30,
  tucked: 26,
  crashed: 18,
  /** Ducked on the ground: the cap is at y - 20, under overhead obstacles that end >= 21 px up. */
  ducking: 20,
} as const;

/**
 * Jump velocity factor while `state.chillTimer > 0` (joint pickup). Gameplay's
 * solver uses it too, so a full hold must still clear every obstacle.
 */
export const CHILL_JUMP_SCALE = 0.8;
/**
 * While chilled the ride/push animation clock and the push rhythm run at this
 * rate (lazier pushing and idle bobbing). Looks only; physics is unaffected.
 */
export const CHILL_ANIM_RATE = 0.7;

/** Upward velocity of the bounce after landing on a person (stomp event). */
export const STOMP_BOUNCE_VELOCITY = 150;
