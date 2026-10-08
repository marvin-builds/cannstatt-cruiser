/**
 * How the UI shows being drunk (state.drunkTimer after a Maßkrug): a HUD
 * timer row with a Maßkrug icon and a woozy screen (double vision that sways,
 * a soft vignette). Kid mode has no beer, so it never shows there.
 */
export const DRUNK_EASE_IN = 0.5;
export const DRUNK_EASE_OUT = 1;
/** Widest sideways sway of the double image, view pixels. */
const SWAY_PX = 3;
/** Sway frequency, radians per second (a slow, lazy wobble). */
const SWAY_SPEED = 2.4;

export function drunkShown(state: { drunkTimer: number; kidMode: boolean }): boolean {
  return state.drunkTimer > 0 && !state.kidMode;
}

/** 0..1: eases in over DRUNK_EASE_IN after drinking and out over the last DRUNK_EASE_OUT seconds. */
export function drunkStrength(timer: number, duration: number): number {
  if (timer <= 0 || duration <= 0) return 0;
  const sinceStart = Math.max(0, duration - timer);
  return Math.min(1, sinceStart / DRUNK_EASE_IN, timer / DRUNK_EASE_OUT);
}

/** Whole-pixel sideways offset of the double image at run time `time`. */
export function swayOffset(time: number, strength: number): number {
  return Math.round(SWAY_PX * strength * Math.sin(time * SWAY_SPEED)) || 0;
}
