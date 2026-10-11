/**
 * Tallies for ranges beyond RAW_RETENTION_DAYS: the day summaries up to the
 * last summarised day plus the raw events of the days after it (usually today,
 * and yesterday until the day's first event condenses it). No day counts twice.
 * The median is the end-count-weighted mean of the daily medians (approximate).
 */
import { dayAfter, daysSince } from './aggregate';
import { rawSummaryRows, runMetric, TOTAL_METRIC, UNKNOWN_KEY, type SummaryRow, type TotalKey } from './day-summary';
import { RUN_COLUMNS, SPLIT_COLUMNS, type Range, type RunHistogram, type Tallies } from './tallies';

/** "Alles" goes back at most this many days. */
export const MAX_ALL_DAYS = 3650;

/** Days of the ALL_RANGE: from the first day with a summary or raw row to today, 1..MAX_ALL_DAYS. */
export async function allRangeDays(db: D1Database, now: number): Promise<number> {
  const row = await db
    .prepare('SELECT MIN(first) AS first FROM (SELECT MIN(day) AS first FROM day_summaries UNION ALL SELECT MIN(day) FROM events)')
    .first<{ first: string | null }>();
  return row?.first ? Math.min(MAX_ALL_DAYS, Math.max(1, daysSince(row.first, now))) : 1;
}

async function summaryRows({ db, from, to }: Range): Promise<SummaryRow[]> {
  const last = await db.prepare('SELECT MAX(day) AS day FROM day_summaries').first<{ day: string | null }>();
  const rawFrom = last?.day && last.day >= from ? dayAfter(last.day) : from;
  const [totals, counts, raw] = await Promise.all([
    db
      .prepare('SELECT day, metric, key, value FROM day_summaries WHERE metric = ? AND day BETWEEN ? AND ?')
      .bind(TOTAL_METRIC, from, to)
      .all<SummaryRow>(),
    db
      .prepare("SELECT '' AS day, metric, key, SUM(value) AS value FROM day_summaries WHERE metric <> ? AND day BETWEEN ? AND ? GROUP BY metric, key")
      .bind(TOTAL_METRIC, from, to)
      .all<SummaryRow>(),
    rawFrom > to ? [] : rawSummaryRows(db, rawFrom, to),
  ]);
  return [...totals.results, ...counts.results, ...raw];
}

/** Folds summary rows (any mix of days) into tallies. */
function foldSummaryRows(rows: readonly SummaryRow[]): Tallies {
  const days = new Map<string, Partial<Record<TotalKey, number>>>();
  const counts = new Map<string, Map<string, number>>();
  for (const { day, metric, key, value } of rows) {
    if (metric === TOTAL_METRIC) {
      const totals = days.get(day) ?? {};
      totals[key as TotalKey] = (totals[key as TotalKey] ?? 0) + value;
      days.set(day, totals);
    } else {
      const byKey = counts.get(metric) ?? new Map<string, number>();
      byKey.set(key, (byKey.get(key) ?? 0) + value);
      counts.set(metric, byKey);
    }
  }
  const entries = (metric: string) => [...(counts.get(metric) ?? new Map<string, number>())].map(([key, count]) => ({ key, count }));
  let ends = 0;
  let endSeconds = 0;
  let weightedMedians = 0;
  for (const totals of days.values()) {
    ends += totals.ends ?? 0;
    endSeconds += totals.end_seconds ?? 0;
    weightedMedians += (totals.end_median ?? 0) * (totals.ends ?? 0);
  }
  return {
    perDay: [...days].map(([day, totals]) => ({ day, sessions: totals.sessions ?? 0, runs: totals.runs ?? 0 })),
    ends: ends === 0 ? { medianSeconds: 0, avgSeconds: 0 } : { medianSeconds: Math.round(weightedMedians / ends), avgSeconds: Math.round(endSeconds / ends) },
    split: Object.fromEntries(
      SPLIT_COLUMNS.map((column) => [column, entries(column).map(({ key, count }) => ({ key: key === UNKNOWN_KEY ? null : key, count }))]),
    ) as Tallies['split'],
    runs: Object.fromEntries(
      (Object.keys(RUN_COLUMNS) as RunHistogram[]).map((name) => [name, entries(runMetric(name)).map(({ key, count }) => ({ key: Number(key), count }))]),
    ) as Tallies['runs'],
  };
}

export async function summaryTallies(range: Range): Promise<Tallies> {
  return foldSummaryRows(await summaryRows(range));
}
