/**
 * The drunk look while `state.drunkTimer > 0` (after a Maßkrug): the body
 * sways slowly up to 2 px left and right over the board, now and then it
 * staggers (a sudden lurch against the sway with a flailing arm), an arm
 * flails up and a small hiccup bubble rises from the mouth. A pure function of the run time,
 * so replays look the same. Looks only: the hitbox never changes.
 */

export type Lean = -2 | -1 | 0 | 1 | 2;

export interface DrunkLook {
  /** Body offset over the board in px: -2..2. */
  lean: Lean;
  /** A stagger lurch: the full lean against the sway, the arm flailing. */
  stagger: boolean;
  /** An arm flails up (the hand position alternates, see FLAIL_STEP). */
  flail: boolean;
  /** Which of the two flail positions is shown. */
  flailHigh: boolean;
  /** Height (px) the hiccup bubble has risen above the mouth, or null when none shows. */
  hiccup: number | null;
}

/** Seconds of one full sway (left, centre, right, centre). */
const SWAY_PERIOD = 1.6;
/** Sway strength (sine, -1..1) from which the body leans 1 px, and 2 px. */
const LEAN_1 = 0.25;
const LEAN_2 = 0.75;
/** Stagger: STAGGER_TIME seconds every STAGGER_PERIOD, starting STAGGER_OFFSET into the run time. */
const STAGGER_PERIOD = 2.9;
const STAGGER_TIME = 0.35;
const STAGGER_OFFSET = 0.6;
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
  const staggerT = phase(time, STAGGER_PERIOD, STAGGER_OFFSET);
  const stagger = staggerT < STAGGER_TIME;
  // The lurch goes against the sway at its start and holds that side to its end.
  const lean: Lean = stagger ? (swayAt(time - staggerT) >= 0 ? -2 : 2) : swayLean(swayAt(time));
  const flailT = phase(time, FLAIL_PERIOD);
  const flail = stagger || flailT < FLAIL_TIME;
  const hiccupT = phase(time, HICCUP_PERIOD, HICCUP_OFFSET);
  return {
    lean,
    stagger,
    flail,
    flailHigh: flail && Math.floor((stagger ? staggerT : flailT) / FLAIL_STEP) % 2 === 0,
    hiccup: hiccupT < HICCUP_TIME ? Math.round((hiccupT / HICCUP_TIME) * HICCUP_RISE) : null,
  };
}

const swayAt = (time: number) => Math.sin((phase(time, SWAY_PERIOD) / SWAY_PERIOD) * Math.PI * 2);

function swayLean(sway: number): Lean {
  const size = Math.abs(sway) >= LEAN_2 ? 2 : Math.abs(sway) >= LEAN_1 ? 1 : 0;
  return (sway < 0 ? -size : size) as Lean;
}
