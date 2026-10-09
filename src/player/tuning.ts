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
/** Seconds the arm reaches up after catching a tossed item (itemCaught). Looks only. */
export const CATCH_TIME = 0.2;

/**
 * Bin crash (crash into a `bin`): seconds head first in the bin on the board
 * (legs kicking) before he pops out and the bin tumbles away. The sequence
 * lasts CRASH_TIME like every crash.
 */
export const BIN_POP_AT = 0.76;

/** Seconds of the in-between frame when the grind trick turns to the camera, and back. Looks only. */
export const TRICK_TURN_TIME = 0.08;

/**
 * Big air (looks only): a jump that rises this many px above its take-off
 * shows the grab pose, like every kicker launch.
 */
export const GRAB_HEIGHT = 40;
/** Falling below this height above the street, the skater lets go of the grab and stretches the legs to land. */
export const GRAB_RELEASE_HEIGHT = 12;
/**
 * Landing impact (downward px/s) from which the landing squash is the hard
 * one (deeper, with dust): a drop of more than ~30 px (sqrt(2 * GRAVITY * 30)
 * is ~279), e.g. off the upper level or a kicker launch. Looks only; the land
 * event and the physics are unchanged.
 */
export const HARD_LANDING_IMPACT = 280;

/**
 * Kicker look: the board rides up the ramp on its front wheel, this many px
 * ahead of the contact point (the rear wheel is still on the street). The
 * drawn skater is lifted to the ramp surface under it, minus the 1 px the
 * nose-up board tilt already raises that wheel. The rear wheel is as far
 * behind it (the board leaves the lip with it). Looks only.
 */
export const KICKER_WHEEL_REACH = 8;

/** Air trick (kickflip, down pressed in the air) after a kicker launch: ticks it runs (0.35 s at 60 Hz). */
export const AIR_TRICK_TICKS = 21;
/**
 * The quicker street kickflip (any jump that is no launch): ticks it runs
 * (0.2 s). It may still run at touch-down; the landing then ends it.
 */
export const STREET_AIR_TRICK_TICKS = 12;
/**
 * A street kickflip starts only with at least this many ticks of air time
 * left, so most of the flip shows before the landing cuts it short.
 */
export const STREET_AIR_TRICK_MIN_AIR = 8;
/**
 * Height above the street from which down starts the street kickflip (a
 * launch has no such limit). A tap hop (apex ~17 px) never reaches it.
 */
export const AIR_TRICK_HEIGHT = 20;
