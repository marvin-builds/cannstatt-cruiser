/**
 * The counts GET /stats is built from, before histograms and group merging.
 * Filled either from raw events (short ranges) or from day summaries plus the
 * raw rows not summarised yet (long ranges).
 */

/** Session columns split by attribute; the location ones get small groups merged. */
export const SPLIT_COLUMNS = ['input', 'orientation', 'platform', 'kid', 'version', 'country', 'region', 'city'] as const;
export type SplitColumn = (typeof SPLIT_COLUMNS)[number];

/** Run histograms and the events column each one counts. */
export const RUN_COLUMNS = { seconds: 'seconds', distance: 'distance_bucket', score: 'score_bucket' } as const;
export type RunHistogram = keyof typeof RUN_COLUMNS;

/** UTC days `from`..`to` (inclusive) of a stats query; `testers` includes the owner's test devices. */
export interface Range {
  db: D1Database;
  from: string;
  to: string;
  testers: boolean;
}

/**
 * SQL condition on an `events` row: its session is not from a test device (ROADMAP 55), so a run or
 * an end counts with its session's flag, even across midnight. Fixed text, no values.
 */
export const PLAYER_ROW =
  "NOT EXISTS (SELECT 1 FROM events AS flagged WHERE flagged.session = events.session AND flagged.kind = 'session' AND flagged.tester = 1)";

/** ` AND PLAYER_ROW` for a range without test devices, else nothing. */
export const testerFilter = ({ testers }: Range): string => (testers ? '' : ` AND ${PLAYER_ROW}`);

export interface Tallies {
  /** Days with sessions or runs; missing days count as zero. New players and returning visits are sessions by their flag. */
  perDay: { day: string; sessions: number; runs: number; newPlayers: number; returningVisits: number }[];
  ends: { medianSeconds: number; avgSeconds: number };
  /** Sessions per value; null is an unknown value. */
  split: Record<SplitColumn, { key: string | null; count: number }[]>;
  /** Runs per reported bucket value. */
  runs: Record<RunHistogram, { key: number | null; count: number }[]>;
}
