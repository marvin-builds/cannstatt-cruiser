/**
 * The drunk look while `state.drunkTimer > 0` (after a Maßkrug): the body
 * sways 1 px left and right over the board, now and then an arm flails up and
 * a small hiccup bubble rises from the mouth. A pure function of the run time,
 * so replays look the same. Looks only: the hitbox never changes.
 */

export interface DrunkLook {
  /** Body offset over the board in px: -1, 0 or 1. */
  lean: -1 | 0 | 1;
  /** An arm flails up (the hand position alternates, see FLAIL_STEP). */
  flail: boolean;
  /** Which of the two flail positions is shown. */
  flailHigh: boolean;
  /** Height (px) the hiccup bubble has risen above the mouth, or null when none shows. */
  hiccup: number | null;
}

/** Seconds of one full sway (left, centre, right, centre). */
const SWAY_PERIOD = 1.3;
/** Arm flail: FLAIL_TIME seconds every FLAIL_PERIOD, the hand switching every FLAIL_STEP. */
const FLAIL_PERIOD = 2.1;
const FLAIL_TIME = 0.4;
const FLAIL_STEP = 0.1;
/** Hiccup: a bubble rises HICCUP_RISE px over HICCUP_TIME seconds, every HICCUP_PERIOD. */
const HICCUP_PERIOD = 1.7;
const HICCUP_TIME = 0.5;
const HICCUP_RISE = 5;
/** The hiccup starts this far into its period, so it does not coincide with the flail. */
const HICCUP_OFFSET = 0.9;

const phase = (time: number, period: number, offset = 0) => (((time - offset) % period) + period) % period;

/** The drunk look at run time `time`, or null while sober. */
export function drunkLook(drunkTimer: number, time: number): DrunkLook | null {
  if (drunkTimer <= 0) return null;
  const sway = Math.sin((phase(time, SWAY_PERIOD) / SWAY_PERIOD) * Math.PI * 2);
  const lean = sway > 0.5 ? 1 : sway < -0.5 ? -1 : 0;
  const flailT = phase(time, FLAIL_PERIOD);
  const flail = flailT < FLAIL_TIME;
  const hiccupT = phase(time, HICCUP_PERIOD, HICCUP_OFFSET);
  return {
    lean,
    flail,
    flailHigh: flail && Math.floor(flailT / FLAIL_STEP) % 2 === 0,
    hiccup: hiccupT < HICCUP_TIME ? Math.round((hiccupT / HICCUP_TIME) * HICCUP_RISE) : null,
  };
}
