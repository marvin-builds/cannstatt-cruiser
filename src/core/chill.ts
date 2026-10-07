/**
 * Timing of the chill effect (joint pickup), shared by gameplay (scroll speed)
 * and ui (screen tint, timer). `state.chillTimer` counts down from
 * CHILL_DURATION to 0; the effect eases in right after the pickup and eases
 * out over its last second, so it ends exactly when the timer does.
 */

/** Seconds the chill effect lasts (state.chillTimer at pickup). */
export const CHILL_DURATION = 6;
/** Seconds the effect takes to set in after the pickup. */
export const CHILL_EASE_IN = 0.5;
/** Seconds at the end of the effect over which it fades back out. */
export const CHILL_EASE_OUT = 1;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 0 (off) .. 1 (full) for the remaining `chillTimer` seconds. */
export function chillStrength(chillTimer: number): number {
  if (chillTimer <= 0) return 0;
  const sincePickup = CHILL_DURATION - chillTimer;
  return smoothstep(Math.min(sincePickup / CHILL_EASE_IN, chillTimer / CHILL_EASE_OUT));
}
