/**
 * Pass-by logic (no WebAudio here): turns the world's vehiclePassed event
 * into a pass-by cue and its intensity. The kind picks the sound, the lane
 * the loudness (front is closer). In light traffic every vehicle is heard;
 * in dense Mitte traffic the rumble already carries the noise, so pass-bys
 * are quieter and at most one per `denseGap` seconds of run time.
 */
import type { GameEvents } from '../types';
import type { Cue } from './backend';

type VehiclePassed = GameEvents['vehiclePassed'];

export const PASS_BY = {
  /** Intensity by lane: the front lane drives right past the camera. */
  lane: { front: 1, back: 0.6 },
  /** Intensity factor in dense Mitte traffic (the rumble covers it). */
  dense: 0.4,
  /** Seconds of run time between two pass-bys in dense traffic. */
  denseGap: 1,
  /** Seconds between any two pass-bys, so lanes crossing together do not stack. */
  lightGap: 0.12,
} as const;

export type PassCue = Extract<Cue, 'passCar' | 'passVan' | 'passBus' | 'passTruck'>;

const CUE_BY_KIND: Record<VehiclePassed['kind'], PassCue> = {
  car: 'passCar',
  van: 'passVan',
  bus: 'passBus',
  truck: 'passTruck',
};
export const PASS_CUES: readonly PassCue[] = Object.values(CUE_BY_KIND);

export interface PassStep {
  cue: PassCue;
  /** 0..1 before ducking. */
  intensity: number;
}

export class PassBy {
  private last = -Infinity;
  /** Reused for every vehicle: no allocation in the game loop. */
  private readonly step: PassStep = { cue: 'passCar', intensity: 0 };

  /** The sound for a vehicle passing at run time `time` (s), or null when rate-limited. */
  pass(vehicle: VehiclePassed, time: number): PassStep | null {
    const gap = vehicle.light ? PASS_BY.lightGap : PASS_BY.denseGap;
    if (time - this.last < gap) return null;
    this.last = time;
    this.step.cue = CUE_BY_KIND[vehicle.kind];
    this.step.intensity = (vehicle.front ? PASS_BY.lane.front : PASS_BY.lane.back) * (vehicle.light ? 1 : PASS_BY.dense);
    return this.step;
  }

  /** A new run: its run time starts at 0 again. */
  reset(): void {
    this.last = -Infinity;
  }
}
