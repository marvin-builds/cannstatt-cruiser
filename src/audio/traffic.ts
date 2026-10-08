/**
 * Stuttgart-Mitte traffic noise logic (no WebAudio here): turns the world's
 * state.trafficDensity into a smoothed rumble level for the backend and
 * decides when a car honks. Honks are rng-free: the run time is cut into
 * slots and a hash of the slot index decides whether that slot honks, so
 * the same run sounds the same.
 */

export const TRAFFIC = {
  /** Fraction of the remaining gap to the density closed per tick (~0.25 s to settle). */
  smoothing: 0.07,
  /** Smallest level change worth a backend call; also the snap-to-silence threshold. */
  minStep: 0.01,
  /** Honks only at or above this density (full Mitte traffic). */
  honkDensity: 0.7,
  /** Seconds per honk slot: at most one honk per slot. */
  honkSlot: 2.5,
  /** Share of slots that honk. */
  honkChance: 0.5,
} as const;

export interface TrafficStep {
  /** New rumble level 0..1 for the backend, or null when it need not change. */
  level: number | null;
  /** True when a car honks this tick. */
  honk: boolean;
}

/** Deterministic 0..1 value for a slot index (integer hash). */
function slotHash(slot: number): number {
  let h = Math.imul(slot ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export class TrafficNoise {
  /** Smoothed rumble level 0..1. */
  level = 0;
  private sent = 0;
  private lastSlot: number | null = null;

  /**
   * One tick. `active` is false while paused, muted, on the title or after
   * game over: the level drops to 0 at once (the backend fades it without a click).
   * `time` is the run time in seconds (state.time).
   */
  update(density: number, active: boolean, time: number): TrafficStep {
    const target = active ? Math.min(1, Math.max(0, density)) : 0;
    if (active) {
      this.level += (target - this.level) * TRAFFIC.smoothing;
      if (Math.abs(target - this.level) < TRAFFIC.minStep / 4) this.level = target;
      if (target === 0 && this.level < TRAFFIC.minStep) this.level = 0;
    } else {
      this.level = 0;
    }
    return { level: this.send(), honk: this.honk(target, time) };
  }

  private send(): number | null {
    const silenced = this.level === 0 && this.sent !== 0;
    if (!silenced && Math.abs(this.level - this.sent) < TRAFFIC.minStep) return null;
    this.sent = this.level;
    return this.sent;
  }

  private honk(density: number, time: number): boolean {
    const slot = Math.floor(time / TRAFFIC.honkSlot);
    if (slot === this.lastSlot) return false;
    this.lastSlot = slot;
    return density >= TRAFFIC.honkDensity && slotHash(slot) < TRAFFIC.honkChance;
  }
}
