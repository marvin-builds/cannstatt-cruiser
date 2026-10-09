/**
 * Air trick start rule (kickflip, down pressed in the air): pure functions so
 * gameplay's scoring can mirror them. The trick never touches the physics;
 * a street flip started too late lands still turning (gameplay's bail).
 *
 * - After a kicker launch the kickflip runs AIR_TRICK_TICKS and only starts
 *   when the remaining air time lets it finish before touching down.
 * - On any other jump (a street jump) it runs STREET_AIR_TRICK_TICKS and
 *   starts from AIR_TRICK_HEIGHT above the street, however little air is
 *   left (ROADMAP 41: a late start is the player's risk). A flip still
 *   running at touch-down ends on the landing tick; the land event reports
 *   the ticks it still needed (flipLeft) and gameplay judges the bail.
 * - Drunk or chilled (ROADMAP 42) the street kickflip turns longer
 *   (flipMood, airTrickTicks), so a late start bails more often.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import type { GameState } from '../types';
import {
  AIR_TRICK_HEIGHT,
  AIR_TRICK_TICKS,
  CHILL_FLIP_SCALE,
  DRUNK_FLIP_SCALE,
  GRAVITY,
  MAX_FALL_SPEED,
  STREET_AIR_TRICK_TICKS,
} from './tuning';

/** What makes a street kickflip slower: drunk (Maßkrug) wins over chilled (joint / kid-mode gum). */
export type FlipMood = 'sober' | 'drunk' | 'chill';

export function flipMood(state: Pick<GameState, 'drunkTimer' | 'chillTimer'>): FlipMood {
  if (state.drunkTimer > 0) return 'drunk';
  return state.chillTimer > 0 ? 'chill' : 'sober';
}

/** Upper bound for the prediction (a very long flight is simply "long enough"). */
const MAX_PREDICTED_TICKS = 600;

/**
 * Ticks until the wheels reach the street from (y, vy) after this tick's
 * move, integrated exactly like the fall physics with normal GRAVITY: the
 * landing happens on the tick this many ticks later (0 = on the street).
 * The hold boost only lowers gravity, so the real flight is never shorter.
 */
export function airTicksLeft(y: number, vy: number): number {
  let ticks = 0;
  while (y < GROUND_Y && ticks < MAX_PREDICTED_TICKS) {
    vy = Math.min(MAX_FALL_SPEED, vy + GRAVITY * TICK_DT);
    y += vy * TICK_DT;
    ticks++;
  }
  return ticks;
}

/**
 * Ticks the kickflip runs: the full one after a kicker launch (never
 * changed), the quick street one otherwise, longer by DRUNK_FLIP_SCALE plus
 * `jitter` (the drunk extra ticks, 0..DRUNK_FLIP_JITTER) or by CHILL_FLIP_SCALE.
 */
export function airTrickTicks(launched: boolean, mood: FlipMood = 'sober', jitter = 0): number {
  if (launched) return AIR_TRICK_TICKS;
  if (mood === 'drunk') return Math.round(STREET_AIR_TRICK_TICKS * DRUNK_FLIP_SCALE) + jitter;
  if (mood === 'chill') return Math.round(STREET_AIR_TRICK_TICKS * CHILL_FLIP_SCALE);
  return STREET_AIR_TRICK_TICKS;
}

/**
 * Down pressed in the air (after this tick's physics) starts the trick:
 * after a launch with at least AIR_TRICK_TICKS of air time left, on a street
 * jump at least AIR_TRICK_HEIGHT above the street (it may not finish).
 */
export function canStartAirTrick(y: number, vy: number, launched: boolean): boolean {
  if (launched) return airTicksLeft(y, vy) >= AIR_TRICK_TICKS;
  return GROUND_Y - y >= AIR_TRICK_HEIGHT;
}
