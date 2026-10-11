/**
 * Contract for the anonymous play statistics (ROADMAP 46): the `POST /event`
 * bodies the game sends and the `GET /stats` answer the insights board reads.
 * Mirrored by server/src/events.ts; telemetry-types.test.ts keeps both equal.
 * No names, no device id, no exact times: values are coarse buckets so a run
 * cannot be matched to a highscore entry.
 */

export const EVENT_KINDS = ['session', 'run', 'end'] as const;
export const INPUTS = ['touch', 'keys'] as const;
export const ORIENTATIONS = ['landscape', 'portrait'] as const;
/** Same values as core's InstallPlatform (`state.install.platform`). */
export const PLATFORMS = ['android', 'ios', 'other'] as const;
/** Lower bounds of the score buckets; a run reports the largest one <= its score. */
export const SCORE_BUCKETS = [0, 100, 500, 2000, 5000] as const;
/** Run distance is reported floored to this many metres, capped at MAX_DISTANCE_M. */
export const DISTANCE_STEP_M = 100;
export const MAX_DISTANCE_M = 5000;
/** Run length is reported floored to this many seconds, capped at MAX_RUN_SECONDS. */
export const RUN_SECONDS_STEP = 10;
export const MAX_RUN_SECONDS = 3600;
/** Active play seconds of a session (`end`), capped. */
export const MAX_END_SECONDS = 4 * 3600;
export const MAX_EVENT_BYTES = 1024;
/** The board's ranges in days. */
export const STATS_RANGES = [7, 30, 90] as const;
/** Country, region or city groups need this many sessions in the range (USER: every place counts); unknown places are "other". */
export const MIN_GROUP_SESSIONS = 1;
/** BUILD_VERSION shape (`YYYY-MM-DD.n`, see changelog.ts). */
export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{1,2}$/;
/** 32 lowercase hex chars, random per page load, kept in memory only. */
export const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;

export type EventKind = (typeof EVENT_KINDS)[number];
export type InputKind = (typeof INPUTS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type ScoreBucket = (typeof SCORE_BUCKETS)[number];
export type StatsRange = (typeof STATS_RANGES)[number];

/** Sent once per page load after the title screen appears. */
export interface SessionEvent {
  kind: 'session';
  session: string;
  version: string;
  input: InputKind;
  orientation: Orientation;
  platform: Platform;
  kid: boolean;
}

/** Sent on game over. */
export interface RunEvent {
  kind: 'run';
  session: string;
  /** Multiple of RUN_SECONDS_STEP, 0..MAX_RUN_SECONDS. */
  seconds: number;
  score: ScoreBucket;
  /** Metres, multiple of DISTANCE_STEP_M, 0..MAX_DISTANCE_M. */
  distance: number;
  kid: boolean;
}

/** Sent by beacon when the page is hidden; the server keeps the largest value per session. */
export interface EndEvent {
  kind: 'end';
  session: string;
  /** Whole seconds of active play in this page load, 0..MAX_END_SECONDS. */
  seconds: number;
}

export type TelemetryEvent = SessionEvent | RunEvent | EndEvent;

/** One bar of a split or histogram. `key` 'other' groups small or unknown values. */
export interface CountEntry {
  key: string;
  count: number;
}

export interface DayStats {
  /** YYYY-MM-DD (UTC). */
  day: string;
  sessions: number;
  runs: number;
  /** Highscore list submissions stored that day (scores table). */
  entries: number;
}

/** The `GET /stats?days=N` answer (aggregates only, never raw rows). */
export interface InsightsStats {
  days: StatsRange;
  /** ISO timestamp (UTC). */
  generatedAt: string;
  /** Every day of the range, oldest first, zero-filled. */
  perDay: DayStats[];
  sessions: {
    total: number;
    /** Over sessions that sent an `end`; 0 when none did. */
    medianSeconds: number;
    avgSeconds: number;
  };
  runs: {
    total: number;
    /** runs / sessions, 0 without sessions. */
    perSession: number;
    /** Keys are bucket lower bounds as strings, ascending. */
    seconds: CountEntry[];
    distance: CountEntry[];
    score: CountEntry[];
  };
  /**
   * Sessions split by attribute, largest first. `country`/`region`/`city` come from
   * Cloudflare's coarse IP location (the IP itself is never stored); groups below
   * MIN_GROUP_SESSIONS and unknown values are merged into 'other'.
   */
  split: {
    input: CountEntry[];
    orientation: CountEntry[];
    platform: CountEntry[];
    kid: CountEntry[];
    version: CountEntry[];
    country: CountEntry[];
    region: CountEntry[];
    city: CountEntry[];
  };
  /** Current top of the online list (same as GET /top). */
  topScores: { name: string; score: number; date: string }[];
}
