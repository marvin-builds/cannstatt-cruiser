/**
 * NorDIY park sound logic (ROADMAP 36, no WebAudio here): turns state.park
 * and the run distance into levels for the backend's park ambience (crowd
 * chatter bed) and the boombox loop, picks the occasional rolling wheels,
 * board clacks and laughter (rng-free slots), and maps the session cheering
 * to cheer cues.
 *
 * Distances are run distances (state.distance values): a distance `d` is at
 * the skater (PLAYER_X) when state.distance === d.
 */
import type { ParkPlan } from '../types';
import type { Cue } from './backend';
import { Slots, slotHash } from './slots';
import { TRAFFIC } from './traffic';

export const PARK = {
  /** Ambience fades in over `ahead` px before the park start and out over `behind` px after its end. */
  ambience: { ahead: 480, behind: 260 },
  /** Boombox loop: fades in over `ahead` px before the boombox and out over `behind` px after it. */
  boombox: { ahead: 520, behind: 320 },
  /** Smallest level change worth a backend call; also the snap-to-silence threshold. */
  minStep: 0.01,
  /** How far the park levels dip at the deepest traffic duck (0.3 = to 70 %). */
  duckDepth: 0.3,
  /** Ambient one-shots play only from this ambience level on. */
  cueFrom: 0.3,
  /** Ambient one-shots: seconds per slot and the share of slots that sound. */
  roll: { slot: 2.3, chance: 0.55 },
  clack: { slot: 1.7, chance: 0.5 },
  laugh: { slot: 3.7, chance: 0.45 },
} as const;

/** Ambient park one-shots; like traffic sounds they never duck anything. */
export type ParkCue = Extract<Cue, 'parkRoll' | 'parkClack' | 'parkLaugh'>;
export const PARK_CUES: readonly ParkCue[] = ['parkRoll', 'parkClack', 'parkLaugh'];
const PARK_CUE_SET: ReadonlySet<Cue> = new Set<Cue>(PARK_CUES);

export function isParkCue(cue: Cue): cue is ParkCue {
  return PARK_CUE_SET.has(cue);
}

/** Session cheer tiers by level: more voices and a longer swell for more cheering. */
const CHEERS: readonly { cue: Cue; from: number }[] = [
  { cue: 'cheerBig', from: 0.7 },
  { cue: 'cheerMid', from: 0.35 },
  { cue: 'cheerSmall', from: 0 },
];

/** The cheer cue for a session level 0..1. */
export function cheerCue(level: number): Cue {
  return CHEERS.find((c) => level >= c.from)?.cue ?? 'cheerSmall';
}

/** Cheer volume 0..1 for a session level: audible from the first trick, full at level 1. */
export function cheerIntensity(level: number): number {
  return 0.45 + 0.55 * Math.min(1, Math.max(0, level));
}

/** Where the boombox stands: on the container, else in the middle of the park. */
export function boomboxAt(park: ParkPlan): number {
  const container = park.pieces.find((p) => p.kind === 'container');
  return container ? (container.from + container.to) / 2 : (park.start + park.end) / 2;
}

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Level 0..1 of a sound fading in over `ahead` px before [from, to] and out over `behind` px after it. */
function spanLevel(from: number, to: number, ahead: number, behind: number, distance: number): number {
  if (distance < from) return smoothstep(1 - (from - distance) / ahead);
  if (distance > to) return smoothstep(1 - (distance - to) / behind);
  return 1;
}

/** Park ambience level 0..1 at a run distance: full inside the park. */
export function ambienceLevel(park: ParkPlan | null, distance: number): number {
  if (!park) return 0;
  return spanLevel(park.start, park.end, PARK.ambience.ahead, PARK.ambience.behind, distance);
}

/** Boombox level 0..1 at a run distance: loudest at the boombox. */
export function boomboxLevel(park: ParkPlan | null, distance: number): number {
  if (!park) return 0;
  const at = boomboxAt(park);
  return spanLevel(at, at, PARK.boombox.ahead, PARK.boombox.behind, distance);
}

export interface ParkStep {
  /** New ambience level for the backend, or null when it need not change. */
  ambience: number | null;
  /** New boombox level for the backend, or null when it need not change. */
  boombox: number | null;
  /** Ambient one-shot to play this tick (at `ParkSound.level`), if any. */
  cue: ParkCue | null;
}

const ROLL_SALT = 0x5bd1e995;
const CLACK_SALT = 0x1b873593;
const LAUGH_SALT = 0x7feb352d;

/** A level that only goes to the backend on noticeable changes. */
class Sent {
  value = 0;
  /** The level to send, or null when it changed too little. */
  send(out: number): number | null {
    const silenced = out === 0 && this.value !== 0;
    if (!silenced && Math.abs(out - this.value) < PARK.minStep) return null;
    this.value = out;
    return out;
  }
}

export class ParkSound {
  /** Current ambience level 0..1 (before ducking); ambient one-shots play at it. */
  level = 0;
  private readonly ambienceOut = new Sent();
  private readonly boomboxOut = new Sent();
  /**
   * The park last heard, copied: gameplay clears state.park once its end has
   * passed, and the sounds keep fading out behind the skater by it.
   */
  private readonly last: ParkPlan = { start: 0, end: 0, pieces: [] };
  private heard = false;
  private readonly rolls = new Slots(PARK.roll.slot);
  private readonly clacks = new Slots(PARK.clack.slot);
  private readonly laughs = new Slots(PARK.laugh.slot);
  /** Reused for every tick: no allocation in the game loop. */
  private readonly step: ParkStep = { ambience: null, boombox: null, cue: null };

  /**
   * One tick. `active` is false while paused, muted, on the title or after
   * game over: both levels drop to 0 at once (the backend fades them).
   * `time` is the run time in seconds, `duck` the traffic duck factor
   * (TrafficNoise.duckFactor, 1 = not ducked).
   */
  update(park: ParkPlan | null, distance: number, active: boolean, time: number, duck: number): ParkStep {
    const plan = this.remember(park, distance);
    this.level = active ? ambienceLevel(plan, distance) : 0;
    const box = active ? boomboxLevel(plan, distance) : 0;
    const dip = 1 - (PARK.duckDepth * (1 - duck)) / (1 - TRAFFIC.duckTo);
    this.step.ambience = this.ambienceOut.send(snap(this.level * dip));
    this.step.boombox = this.boomboxOut.send(snap(box * dip));
    this.step.cue = this.cue(time);
    return this.step;
  }

  /** Ambience level the backend has last been sent (after ducking). */
  get ambience(): number {
    return this.ambienceOut.value;
  }

  /** Boombox level the backend has last been sent (after ducking). */
  get boombox(): number {
    return this.boomboxOut.value;
  }

  /** Whether the backend currently hears the ambience or the boombox. */
  get sounding(): boolean {
    return this.ambience > 0 || this.boombox > 0;
  }

  /** A new run: no park is remembered and the slots start fresh. */
  reset(): void {
    this.heard = false;
    this.rolls.reset();
    this.clacks.reset();
    this.laughs.reset();
  }

  /** The park to hear: the planned one, or the one just passed while it fades out. */
  private remember(park: ParkPlan | null, distance: number): ParkPlan | null {
    if (park) {
      this.last.start = park.start;
      this.last.end = park.end;
      this.last.pieces = park.pieces;
      this.heard = true;
      return park;
    }
    // Gone before its end: not a passed park (e.g. a new plan), so silence.
    if (this.heard && distance < this.last.end) this.heard = false;
    return this.heard ? this.last : null;
  }

  private cue(time: number): ParkCue | null {
    // Every slot clock advances every tick, so a skipped slot never fires late.
    const roll = this.rolls.enter(time) && slotHash(this.rolls.index, ROLL_SALT) < PARK.roll.chance;
    const clack = this.clacks.enter(time) && slotHash(this.clacks.index, CLACK_SALT) < PARK.clack.chance;
    const laugh = this.laughs.enter(time) && slotHash(this.laughs.index, LAUGH_SALT) < PARK.laugh.chance;
    if (this.level < PARK.cueFrom) return null;
    if (laugh) return 'parkLaugh';
    if (roll) return 'parkRoll';
    return clack ? 'parkClack' : null;
  }
}

/** Levels this small are silence. */
function snap(level: number): number {
  return level < PARK.minStep ? 0 : level;
}
