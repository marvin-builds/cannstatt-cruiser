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

/** UTC days `from`..`to` (inclusive) of a stats query. */
export interface Range {
  db: D1Database;
  from: string;
  to: string;
}

export interface Tallies {
  /** Days with sessions or runs; missing days count as zero. */
  perDay: { day: string; sessions: number; runs: number }[];
  ends: { medianSeconds: number; avgSeconds: number };
  /** Sessions per value; null is an unknown value. */
  split: Record<SplitColumn, { key: string | null; count: number }[]>;
  /** Runs per reported bucket value. */
  runs: Record<RunHistogram, { key: number | null; count: number }[]>;
}
