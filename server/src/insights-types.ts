/**
 * Shapes of the `POST /event` bodies and the `GET /stats` answer. Copy of the
 * types in the game's src/net/telemetry-types.ts (the worker builds on its
 * own); test/insights-types.test.ts checks both are equal at type level.
 */
import type { INPUTS, ORIENTATIONS, PLATFORMS, SCORE_BUCKETS, STATS_RANGES } from './events';

export type InputKind = (typeof INPUTS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type ScoreBucket = (typeof SCORE_BUCKETS)[number];
export type StatsRange = (typeof STATS_RANGES)[number];

export interface SessionEvent {
  kind: 'session';
  session: string;
  version: string;
  input: InputKind;
  platform: Platform;
  kid: boolean;
  tester?: boolean;
  returning?: boolean;
}

export interface RunEvent {
  kind: 'run';
  session: string;
  seconds: number;
  score: ScoreBucket;
  distance: number;
  kid: boolean;
}

export interface EndEvent {
  kind: 'end';
  session: string;
  seconds: number;
}

export type TelemetryEvent = SessionEvent | RunEvent | EndEvent;

export interface CountEntry {
  key: string;
  count: number;
}

export interface DayStats {
  day: string;
  sessions: number;
  runs: number;
  entries: number;
  newPlayers: number;
  returningVisits: number;
}

export interface InsightsStats {
  days: StatsRange;
  generatedAt: string;
  perDay: DayStats[];
  sessions: {
    total: number;
    medianSeconds: number;
    avgSeconds: number;
  };
  visits: { new: number; returning: number; unknown: number };
  runs: {
    total: number;
    perSession: number;
    seconds: CountEntry[];
    distance: CountEntry[];
    score: CountEntry[];
  };
  split: {
    input: CountEntry[];
    platform: CountEntry[];
    kid: CountEntry[];
    version: CountEntry[];
    country: CountEntry[];
    region: CountEntry[];
    city: CountEntry[];
  };
  topScores: { name: string; score: number; date: string }[];
}
