/**
 * Adaptive density (ROADMAP 52 Phase 3 point 12, adult mode only): while the
 * skater keeps every heart for a long stretch, the street gets a little
 * denser; a crash (or any lost heart) relaxes it at once.
 *
 * AdaptiveDensity measures the seconds at full hearts without a crash and
 * turns them into a factor 0..1: 0 for the first DENSITY_FROM_SECONDS, then
 * rising linearly to 1 at DENSITY_FULL_SECONDS. Kid mode keeps it at 0.
 *
 * The spawner plans each pattern with the factor of the moment (planned
 * patterns ahead keep theirs) and only moves knobs that the hard fairness
 * rule leaves free (ROADMAP 52): the gap between patterns (denseGap) and the
 * quiet cap (denseQuiet) shrink a little, never below the free street every
 * pattern leaves (spawner.ts effectGap), and from DENSE_TIER_FROM on the
 * pattern tier steps up by one (denseTier: more elements per pattern, at
 * most the top tier). Every pattern is still solver-checked with the full
 * human take-off window across its boundaries, so no window gets tighter.
 */
import { MAX_HEALTH } from '../core/config';
import type { GameState } from '../types';

/** Seconds at full hearts without a crash before the street starts to get denser. */
export const DENSITY_FROM_SECONDS = 45;
/** Seconds at full hearts at which the density reaches its most (factor 1). */
export const DENSITY_FULL_SECONDS = 90;
/** Share of the difficulty gap between patterns cut at full density. */
export const DENSE_GAP_CUT = 0.25;
/** Share of the quiet cap (spawner.ts QUIET_SECONDS) cut at full density. */
export const DENSE_QUIET_CUT = 0.12;
/** Density from which the pattern tier steps up by one. */
export const DENSE_TIER_FROM = 0.5;
/** The highest pattern tier (difficulty.ts TIER_DISTANCES unlock 1..3). */
const TOP_TIER = 3;
/** Rounding slack of the summed tick times. */
const EPSILON = 1e-9;

export class AdaptiveDensity {
  /** Seconds at full hearts since the last crash or lost heart. */
  private full = 0;
  private kidMode = false;

  /** Every playing tick. */
  update(state: GameState, dt: number): void {
    this.kidMode = state.kidMode;
    this.full = state.health >= MAX_HEALTH ? this.full + dt : 0;
  }

  /** A crash relaxes the street at once. */
  crashed(): void {
    this.full = 0;
  }

  reset(): void {
    this.full = 0;
  }

  /** 0 (as planned without it) .. 1 (densest); always 0 in kid mode. */
  get factor(): number {
    if (this.kidMode) return 0;
    return Math.min(1, Math.max(0, (this.full + EPSILON - DENSITY_FROM_SECONDS) / (DENSITY_FULL_SECONDS - DENSITY_FROM_SECONDS)));
  }
}

/** The difficulty gap (px) after a pattern at `density`. */
export function denseGap(gap: number, density: number): number {
  return Math.round(gap * (1 - DENSE_GAP_CUT * density));
}

/** The quiet cap (seconds without something to react to) at `density`. */
export function denseQuiet(seconds: number, density: number): number {
  return seconds * (1 - DENSE_QUIET_CUT * density);
}

/** The pattern tier at `density`: one up from DENSE_TIER_FROM on, never from tier 0 (the run's first seconds) and never past the top. */
export function denseTier(tier: number, density: number): number {
  return tier >= 1 && density >= DENSE_TIER_FROM ? Math.min(TOP_TIER, tier + 1) : tier;
}
