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
/** Raw events are deleted after this many days; older days live on as daily summaries (ROADMAP 48). */
export const RAW_RETENTION_DAYS = 90;
/** The range value meaning "Alles": every day since the first recorded one. */
export const ALL_RANGE = 0;
/** The board's ranges in days; ALL_RANGE is everything. Ranges beyond RAW_RETENTION_DAYS come from the summaries. */
export const STATS_RANGES = [7, 30, 90, 365, ALL_RANGE] as const;
/** Country, region or city groups need this many sessions in the range (USER: every place counts); unknown places are "other". */
export const MIN_GROUP_SESSIONS = 1;
/** BUILD_VERSION shape (`YYYY-MM-DD.n`, see changelog.ts). */
export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{1,2}$/;
/** 32 lowercase hex chars, random per page load, kept in memory only. */
export const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;
/**
 * Store key (core/storage, so `cannstatt-cruiser:testDevice`) marking the owner's
 * test devices (ROADMAP 55): true = test device, false = switched off on the
 * board, absent = the board was never unlocked here. Only the insights board
 * writes it; the game only reads it.
 */
export const TEST_DEVICE_KEY = 'testDevice';
/** `GET /stats?…&testers=1` includes test devices; without it they are left out. */
export const STATS_TESTERS_PARAM = 'testers';

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
  /** This device is marked as the owner's test device (TEST_DEVICE_KEY true); omitted = false. */
  tester?: boolean;
  /** The game found its own stored data from before this page load (new vs. returning player); omitted by builds before ROADMAP 55 = unknown. */
  returning?: boolean;
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
  /** Sessions that day with `returning: false` (new players: no stored game data). */
  newPlayers: number;
  /** Sessions that day with `returning: true` (visits, not people). */
  returningVisits: number;
}

/** The `GET /stats?days=N` answer (aggregates only, never raw rows). */
export interface InsightsStats {
  /** The asked range; ALL_RANGE (0) for "Alles". */
  days: StatsRange;
  /** ISO timestamp (UTC). */
  generatedAt: string;
  /** Every day of the range, oldest first, zero-filled. */
  perDay: DayStats[];
  sessions: {
    total: number;
    /** Over sessions that sent an `end`; 0 when none did. For ranges beyond RAW_RETENTION_DAYS the mean of the daily medians weighted by their end counts (approximate). */
    medianSeconds: number;
    avgSeconds: number;
  };
  /** Sessions by the `returning` flag; `unknown` = sent by builds before ROADMAP 55. */
  visits: { new: number; returning: number; unknown: number };
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
