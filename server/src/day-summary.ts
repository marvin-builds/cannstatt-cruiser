/**
 * Daily summaries of the play statistics (table day_summaries, ROADMAP 48):
 * per finished UTC day the counts GET /stats needs, kept for good after the raw
 * events are pruned. Rows are (day, metric, key, value, player_value), counts only,
 * never a session id or an hour; migrations/0004_day_summaries.sql lists the metrics,
 * 0006 the player-only count (NULL on days summarised before it).
 */
import { PLAYER_ROW, RUN_COLUMNS, SPLIT_COLUMNS, type RunHistogram, type SplitColumn } from './tallies';

/** At most this many days with raw rows are summarised per run; the rest follow on the next days. */
export const MAX_CONDENSE_DAYS = 100;
export const TOTAL_METRIC = 'total';
/** Keys of the TOTAL_METRIC rows; new_players and returning_visits count sessions by their is_returning flag. */
export type TotalKey = 'sessions' | 'runs' | 'ends' | 'end_seconds' | 'end_median' | 'new_players' | 'returning_visits';
/** Key of an unknown split value (the primary key cannot hold null). */
export const UNKNOWN_KEY = '';

export const runMetric = (histogram: RunHistogram): string => `run_${histogram}`;

/** `value` counts every matching row, `player_value` the rows without test devices (ROADMAP 55). */
export interface SummaryRow {
  day: string;
  metric: string;
  key: string;
  value: number;
  player_value: number;
}

const splitKey = (column: SplitColumn): string =>
  column === 'kid' ? "CASE WHEN kid = 1 THEN 'true' ELSE 'false' END" : `COALESCE(${column}, '${UNKNOWN_KEY}')`;

/** The value and player_value columns: rows matching `condition`, all and without test devices. */
const sumBoth = (condition: string): string => `SUM(${condition}) AS value, SUM(${condition} AND ${PLAYER_ROW}) AS player_value`;

/** The middle row, or the mean of the two middle rows, rounded; `place` and `n` name the row's place and the group size. */
const median = (place: string, n: string, condition = '1'): string =>
  `CAST(ROUND(AVG(CASE WHEN ${condition} AND ${place} IN ((${n} + 1) / 2, (${n} + 2) / 2) THEN seconds END)) AS INTEGER)`;

/** The day's median of the end seconds, of all ends and of the players' ends (0 without any). */
const MEDIAN_PART = `SELECT day, '${TOTAL_METRIC}' AS metric, 'end_median' AS key, ${median('place', 'n')} AS value,
    COALESCE(${median('player_place', 'player_n', 'player')}, 0) AS player_value FROM (
    SELECT day, seconds, player,
      ROW_NUMBER() OVER (PARTITION BY day ORDER BY seconds) AS place, COUNT(*) OVER (PARTITION BY day) AS n,
      ROW_NUMBER() OVER (PARTITION BY day, player ORDER BY seconds) AS player_place, COUNT(*) OVER (PARTITION BY day, player) AS player_n
    FROM (SELECT day, seconds, ${PLAYER_ROW} AS player FROM events WHERE kind = 'end' AND day BETWEEN ?1 AND ?2)
  ) GROUP BY day`;

/** D1 rejects a compound SELECT of more terms than this ("too many terms in compound SELECT"). */
export const MAX_COMPOUND_TERMS = 5;

const TOTAL_COUNTS: Partial<Record<TotalKey, string>> = {
  sessions: "kind = 'session'",
  runs: "kind = 'run'",
  ends: "kind = 'end'",
  new_players: "kind = 'session' AND is_returning IS 0",
  returning_visits: "kind = 'session' AND is_returning IS 1",
};

/** One SELECT per part of the summary; every one names all five columns, as the first term of a compound must. */
const SUMMARY_PARTS = [
  ...Object.entries(TOTAL_COUNTS).map(
    ([key, condition]) => `SELECT day, '${TOTAL_METRIC}' AS metric, '${key}' AS key, ${sumBoth(condition)} FROM events WHERE day BETWEEN ?1 AND ?2 GROUP BY day`,
  ),
  `SELECT day, '${TOTAL_METRIC}' AS metric, 'end_seconds' AS key, COALESCE(SUM(CASE WHEN kind = 'end' THEN seconds END), 0) AS value,
     COALESCE(SUM(CASE WHEN kind = 'end' AND ${PLAYER_ROW} THEN seconds END), 0) AS player_value
   FROM events WHERE day BETWEEN ?1 AND ?2 GROUP BY day`,
  MEDIAN_PART,
  ...SPLIT_COLUMNS.map(
    (column) =>
      `SELECT day, '${column}' AS metric, ${splitKey(column)} AS key, ${sumBoth('1')} FROM events WHERE kind = 'session' AND day BETWEEN ?1 AND ?2 GROUP BY day, key`,
  ),
  ...(Object.entries(RUN_COLUMNS) as [RunHistogram, string][]).map(
    ([histogram, column]) =>
      `SELECT day, '${runMetric(histogram)}' AS metric, CAST(${column} AS TEXT) AS key, ${sumBoth('1')} FROM events
       WHERE kind = 'run' AND ${column} IS NOT NULL AND day BETWEEN ?1 AND ?2 GROUP BY day, key`,
  ),
];

/**
 * Statements whose rows together are the SummaryRow rows computed from the raw events of the days
 * ?1..?2 (inclusive), each a compound of at most MAX_COMPOUND_TERMS parts.
 * Every day with raw rows gets all TOTAL_METRIC rows except end_median, which needs an end.
 * Built from fixed column lists only; values are always bound.
 */
export const SUMMARY_SELECTS: readonly string[] = Array.from({ length: Math.ceil(SUMMARY_PARTS.length / MAX_COMPOUND_TERMS) }, (_, i) =>
  SUMMARY_PARTS.slice(i * MAX_COMPOUND_TERMS, (i + 1) * MAX_COMPOUND_TERMS).join('\nUNION ALL '),
);

/** The SummaryRow rows of the raw events of the days `from`..`to` (inclusive). */
export async function rawSummaryRows(db: D1Database, from: string, to: string): Promise<SummaryRow[]> {
  const parts = await Promise.all(SUMMARY_SELECTS.map((sql) => db.prepare(sql).bind(from, to).all<SummaryRow>()));
  return parts.flatMap((part) => part.results);
}

/**
 * The statements (one per SUMMARY_SELECTS entry) that summarise the oldest days (before `today`) that have raw rows and are newer
 * than the last summarised day, at most MAX_CONDENSE_DAYS of them; none when nothing is pending.
 * INSERT OR IGNORE keeps a summarised day unchanged even if it were ever offered again.
 */
export async function condenseStatements(db: D1Database, today: string): Promise<D1PreparedStatement[]> {
  const pending = await db
    .prepare(
      `SELECT MIN(day) AS first, MAX(day) AS last FROM (
         SELECT DISTINCT day FROM events
         WHERE day < ? AND day > COALESCE((SELECT MAX(day) FROM day_summaries), '')
         ORDER BY day LIMIT ?
       )`,
    )
    .bind(today, MAX_CONDENSE_DAYS)
    .first<{ first: string | null; last: string | null }>();
  if (!pending?.first || !pending.last) return [];
  return SUMMARY_SELECTS.map((sql) =>
    db.prepare(`INSERT OR IGNORE INTO day_summaries (day, metric, key, value, player_value) ${sql}`).bind(pending.first, pending.last),
  );
}
