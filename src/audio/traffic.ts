/**
 * Traffic noise logic (no WebAudio here): turns the world's
 * state.trafficDensity into a smoothed Mitte rumble level for the backend,
 * swells it in and out around each passing vehicle of light traffic (the
 * street outside Mitte is silent in between), ducks it briefly under gameplay
 * sounds and decides when a horn sounds or a truck passes. Traffic cues are rng-free: the run time is cut into slots and a
 * hash of the slot index decides whether and what sounds in that slot, so the
 * same run sounds the same.
 */
import { LIGHT_TRAFFIC } from '../world/traffic';
import type { Cue } from './backend';
import { PASS_CUES } from './passby';
import { Slots, slotHash } from './slots';

export const TRAFFIC = {
  /** Fraction of the remaining gap to the density closed per tick (~0.25 s to settle). */
  smoothing: 0.07,
  /**
   * Hum curve exponent over the density above LIGHT_TRAFFIC: light traffic
   * has no steady hum, the Mitte ramps rise quickly towards full Mitte (1).
   */
  humCurve: 0.5,
  /**
   * One passing vehicle of light traffic: its hum rises for `rise` seconds
   * after the crossing event and is gone `length` seconds after it. `peak` is
   * the level of a front-lane vehicle (strength 1); `voices` overlapping
   * vehicles are heard at once (more replace the oldest).
   */
  swell: { rise: 0.25, length: 1.2, peak: 0.35, voices: 4 },
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
const TRAFFIC_CUE_SET: ReadonlySet<Cue> = new Set<Cue>([...TRAFFIC_CUES, ...PASS_CUES]);

/** True for horns, passing trucks and vehicle pass-bys (they never duck the rumble). */
export function isTrafficCue(cue: Cue): cue is TrafficCue {
  return TRAFFIC_CUE_SET.has(cue);
}

/** Steady rumble level 0..1 for a traffic density: silent at light traffic, full in Mitte. */
export function humLevel(density: number): number {
  const dense = (density - LIGHT_TRAFFIC) / (1 - LIGHT_TRAFFIC);
  return Math.min(1, Math.max(0, dense)) ** TRAFFIC.humCurve;
}

/** Swell shape 0..1 at `age` seconds after a vehicle passed: a smooth rise, then a soft fade to 0. */
export function swellEnvelope(age: number): number {
  const { rise, length } = TRAFFIC.swell;
  if (age <= 0 || age >= length) return 0;
  if (age < rise) return Math.sin((age / rise) * (Math.PI / 2));
  return (1 - (age - rise) / (length - rise)) ** 2;
}

export interface TrafficStep {
  /** New rumble level 0..1 for the backend, or null when it need not change. */
  level: number | null;
  /** Traffic sound to play this tick, if any. */
  cue: TrafficCue | null;
}

const HORN_SALT = 0x9e3779b9;
const HORN_KIND_SALT = 0x27d4eb2f;
const TRUCK_SALT = 0x165667b1;

/** The vehicles of light traffic currently swelling (fixed slots: no allocation per vehicle). */
class Swells {
  private readonly starts: number[] = new Array<number>(TRAFFIC.swell.voices).fill(-Infinity);
  private readonly strengths: number[] = new Array<number>(TRAFFIC.swell.voices).fill(0);

  /** A vehicle passed at run time `time`; it takes the slot of the oldest swell. */
  add(strength: number, time: number): void {
    let oldest = 0;
    for (let i = 1; i < this.starts.length; i++) if (this.starts[i]! < this.starts[oldest]!) oldest = i;
    this.starts[oldest] = time;
    this.strengths[oldest] = strength;
  }

  /** Summed swell level at run time `time`, before clamping. */
  level(time: number): number {
    let sum = 0;
    for (let i = 0; i < this.starts.length; i++) sum += this.strengths[i]! * swellEnvelope(time - this.starts[i]!);
    return sum * TRAFFIC.swell.peak;
  }

  reset(): void {
    this.starts.fill(-Infinity);
    this.strengths.fill(0);
  }
}

export class TrafficNoise {
  /** Smoothed steady rumble level 0..1 (before swells and ducking). */
  level = 0;
  private sent = 0;
  private readonly swells = new Swells();
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
    const clamped = active ? Math.min(1, Math.max(0, density)) : 0;
    const target = humLevel(clamped);
    if (active) {
      this.level += (target - this.level) * TRAFFIC.smoothing;
      if (Math.abs(target - this.level) < TRAFFIC.minStep / 4) this.level = target;
      if (target === 0 && this.level < TRAFFIC.minStep) this.level = 0;
    } else {
      this.level = 0;
    }
    this.recoverDuck();
    const out = active ? Math.min(1, this.level + this.swells.level(time)) * this.duckGain : 0;
    this.step.level = this.send(out);
    this.step.cue = this.cue(clamped, time);
    return this.step;
  }

  /**
   * A vehicle of light traffic passes at run time `time`: the hum swells in and
   * out around it. `strength` 0..1 is its loudness (the back lane is quieter).
   */
  swell(strength: number, time: number): void {
    this.swells.add(strength, time);
  }

  /** Whether the backend currently hears any rumble or swell. */
  get sounding(): boolean {
    return this.sent > 0;
  }

  /** Current duck factor (1 = not ducked); pass-by sounds follow it like the rumble. */
  get duckFactor(): number {
    return this.duckGain;
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
    this.swells.reset();
    this.duckGain = 1;
    this.duckHold = 0;
  }

  private recoverDuck(): void {
    if (this.duckHold > 0) this.duckHold--;
    else this.duckGain = Math.min(1, this.duckGain + TRAFFIC.duckRecover);
  }

  /** The level for the backend, or null when it changed too little to send. */
  private send(out: number): number | null {
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
