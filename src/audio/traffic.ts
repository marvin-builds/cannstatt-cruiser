/**
 * Stuttgart-Mitte traffic noise logic (no WebAudio here): turns the world's
 * state.trafficDensity into a smoothed rumble level for the backend, ducks it
 * briefly under gameplay sounds and decides when a horn sounds or a truck
 * passes. Traffic cues are rng-free: the run time is cut into slots and a
 * hash of the slot index decides whether and what sounds in that slot, so the
 * same run sounds the same.
 */
import type { Cue } from './backend';

export const TRAFFIC = {
  /** Fraction of the remaining gap to the density closed per tick (~0.25 s to settle). */
  smoothing: 0.07,
  /** Smallest level change worth a backend call; also the snap-to-silence threshold. */
  minStep: 0.01,
  /** Rumble factor right after a gameplay sound (jump, crash, item ...). */
  duckTo: 0.45,
  /** Ticks the rumble stays ducked before it glides back. */
  duckHoldTicks: 8,
  /** Duck factor regained per tick after the hold (~0.4 s back to full). */
  duckRecover: 0.025,
  /** Horns only at or above this density. */
  hornDensity: 0.5,
  /** Seconds per horn slot: at most one horn per slot. */
  hornSlot: 1.5,
  /** Share of horn slots that honk at hornDensity and at full density. */
  hornChance: { min: 0.15, max: 0.7 },
  /** Passing trucks only at or above this density. */
  truckDensity: 0.6,
  /** Seconds per truck slot. */
  truckSlot: 6,
  /** Share of truck slots in which a truck passes. */
  truckChance: 0.55,
} as const;

/** One-shot traffic sounds; they never duck the rumble. */
export type TrafficCue = Extract<Cue, 'honk' | 'honkShort' | 'hornDeep' | 'truckPass'>;
/** Horns with their share of all horns: car 'mööp', small car double beep, deep truck / bus horn. */
const HORNS: readonly { cue: TrafficCue; upTo: number }[] = [
  { cue: 'honk', upTo: 0.45 },
  { cue: 'honkShort', upTo: 0.75 },
  { cue: 'hornDeep', upTo: 1 },
];
export const HORN_CUES: readonly TrafficCue[] = HORNS.map((h) => h.cue);
export const TRAFFIC_CUES: readonly TrafficCue[] = [...HORN_CUES, 'truckPass'];
const TRAFFIC_CUE_SET: ReadonlySet<Cue> = new Set(TRAFFIC_CUES);

/** True for horns and passing trucks (they never duck the rumble). */
export function isTrafficCue(cue: Cue): cue is TrafficCue {
  return TRAFFIC_CUE_SET.has(cue);
}

export interface TrafficStep {
  /** New rumble level 0..1 for the backend, or null when it need not change. */
  level: number | null;
  /** Traffic sound to play this tick, if any. */
  cue: TrafficCue | null;
}

/** Deterministic 0..1 value for a slot index and a salt (integer hash). */
function slotHash(slot: number, salt: number): number {
  let h = Math.imul(slot ^ salt, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

const HORN_SALT = 0x9e3779b9;
const HORN_KIND_SALT = 0x27d4eb2f;
const TRUCK_SALT = 0x165667b1;

/** Fires once per slot of `length` seconds; tells whether a new slot began. */
class Slots {
  private last: number | null = null;
  index = 0;
  constructor(private readonly length: number) {}

  enter(time: number): boolean {
    this.index = Math.floor(time / this.length);
    if (this.index === this.last) return false;
    this.last = this.index;
    return true;
  }

  reset(): void {
    this.last = null;
  }
}

export class TrafficNoise {
  /** Smoothed rumble level 0..1 (before ducking). */
  level = 0;
  private sent = 0;
  private duckGain = 1;
  private duckHold = 0;
  private readonly horns = new Slots(TRAFFIC.hornSlot);
  private readonly trucks = new Slots(TRAFFIC.truckSlot);
  /** Reused for every tick: no allocation in the game loop. */
  private readonly step: TrafficStep = { level: null, cue: null };

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
    this.recoverDuck();
    this.step.level = this.send();
    this.step.cue = this.cue(target, time);
    return this.step;
  }

  /** A gameplay sound plays: dip the rumble so it stays clearly audible. */
  duck(): void {
    this.duckGain = TRAFFIC.duckTo;
    this.duckHold = TRAFFIC.duckHoldTicks;
  }

  /** A new run: its run time starts at 0 again, so the slots start fresh. */
  reset(): void {
    this.horns.reset();
    this.trucks.reset();
    this.duckGain = 1;
    this.duckHold = 0;
  }

  private recoverDuck(): void {
    if (this.duckHold > 0) this.duckHold--;
    else this.duckGain = Math.min(1, this.duckGain + TRAFFIC.duckRecover);
  }

  private send(): number | null {
    const out = this.level * this.duckGain;
    const silenced = out === 0 && this.sent !== 0;
    if (!silenced && Math.abs(out - this.sent) < TRAFFIC.minStep) return null;
    this.sent = out;
    return out;
  }

  private cue(density: number, time: number): TrafficCue | null {
    // Both slot clocks advance every tick, so a skipped slot never fires late.
    const newHornSlot = this.horns.enter(time);
    const newTruckSlot = this.trucks.enter(time);
    if (newTruckSlot && density >= TRAFFIC.truckDensity && slotHash(this.trucks.index, TRUCK_SALT) < TRAFFIC.truckChance) {
      return 'truckPass';
    }
    if (!newHornSlot || density < TRAFFIC.hornDensity) return null;
    const t = (density - TRAFFIC.hornDensity) / (1 - TRAFFIC.hornDensity);
    const chance = TRAFFIC.hornChance.min + (TRAFFIC.hornChance.max - TRAFFIC.hornChance.min) * t;
    if (slotHash(this.horns.index, HORN_SALT) >= chance) return null;
    const kind = slotHash(this.horns.index, HORN_KIND_SALT);
    return HORNS.find((h) => kind < h.upTo)!.cue;
  }
}
