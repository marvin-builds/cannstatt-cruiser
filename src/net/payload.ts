import { PX_PER_METRE } from '../ui/layout';
import type { ScoreSubmission } from './api';

/** A finished run as the game knows it. */
export interface RunStats {
  score: number;
  /** Game pixels. */
  distance: number;
  /** Seconds of play (not paused time). */
  seconds: number;
}

/** The POST /score body: whole numbers, distance in metres, duration at least 1 s. */
export function scorePayload(run: RunStats, name: string, version: string, device: string): ScoreSubmission {
  return {
    name,
    score: Math.max(0, Math.round(run.score)),
    distance: Math.max(0, Math.round(run.distance / PX_PER_METRE)),
    duration: Math.max(1, Math.round(run.seconds)),
    version,
    device,
  };
}
