/**
 * The GET /stats answer: aggregates over the last `days` UTC days (today
 * included; ALL_RANGE from the first recorded day) and the scores table.
 * Ranges up to RAW_RETENTION_DAYS count raw events; longer ones read the day
 * summaries (summary-stats.ts). Never returns raw rows.
 */
import { dayRange, histogram, mergeSmallGroups } from './aggregate';
import { ALL_RANGE, DISTANCE_STEP_M, MAX_DISTANCE_M, MIN_GROUP_SESSIONS, RAW_RETENTION_DAYS, SCORE_BUCKETS } from './events';
import type { DayStats, InsightsStats, StatsRange } from './insights-types';
import { topRows } from './store';
import { allRangeDays, summaryTallies } from './summary-stats';
import { RUN_COLUMNS, SPLIT_COLUMNS, type Range, type RunHistogram, type SplitColumn, type Tallies } from './tallies';

/** Lower bounds (seconds) of the run length histogram. */
const RUN_SECONDS_HISTOGRAM = [0, 30, 60, 180, 600] as const;
const DISTANCE_BOUNDS = Array.from({ length: MAX_DISTANCE_M / DISTANCE_STEP_M + 1 }, (_, i) => i * DISTANCE_STEP_M);
const HISTOGRAM_BOUNDS: Record<RunHistogram, readonly number[]> = { seconds: RUN_SECONDS_HISTOGRAM, distance: DISTANCE_BOUNDS, score: SCORE_BUCKETS };
const LOCATION_SPLITS: ReadonlySet<SplitColumn> = new Set(['country', 'region', 'city']);

type Key = string | number | null;

/** COUNT per value of `column` over the `kind` rows of the range. `column` comes from a fixed list. */
async function countBy<K extends Key>({ db, from, to }: Range, kind: 'session' | 'run', column: string): Promise<{ key: K; count: number }[]> {
  const sql = `SELECT ${column} AS key, COUNT(*) AS count FROM events WHERE day BETWEEN ? AND ? AND kind = ? GROUP BY ${column}`;
  return (await db.prepare(sql).bind(from, to, kind).all<{ key: K; count: number }>()).results;
}

async function rawPerDay({ db, from, to }: Range): Promise<Tallies['perDay']> {
  const rows = await db
    .prepare("SELECT day, kind, COUNT(*) AS n FROM events WHERE day BETWEEN ? AND ? AND kind IN ('session', 'run') GROUP BY day, kind")
    .bind(from, to)
    .all<{ day: string; kind: 'session' | 'run'; n: number }>();
  const byDay = new Map<string, { day: string; sessions: number; runs: number }>();
  for (const { day, kind, n } of rows.results) {
    const entry = byDay.get(day) ?? { day, sessions: 0, runs: 0 };
    entry[kind === 'session' ? 'sessions' : 'runs'] = n;
    byDay.set(day, entry);
  }
  return [...byDay.values()];
}

/** Median and average of the sessions' `end` seconds, whole seconds; 0 without ends. */
async function rawEnds({ db, from, to }: Range): Promise<Tallies['ends']> {
  const where = "FROM events WHERE day BETWEEN ? AND ? AND kind = 'end'";
  const summary = await db.prepare(`SELECT COUNT(*) AS n, AVG(seconds) AS avg ${where}`).bind(from, to).first<{ n: number; avg: number | null }>();
  const n = summary?.n ?? 0;
  if (n === 0) return { medianSeconds: 0, avgSeconds: 0 };
  const middle = await db
    .prepare(`SELECT seconds ${where} ORDER BY seconds LIMIT ? OFFSET ?`)
    .bind(from, to, 2 - (n % 2), Math.floor((n - 1) / 2))
    .all<{ seconds: number }>();
  const values = middle.results.map((row) => row.seconds);
  const median = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { medianSeconds: Math.round(median), avgSeconds: Math.round(summary!.avg ?? 0) };
}

/** Tallies straight from the raw events of the range. */
async function rawTallies(range: Range): Promise<Tallies> {
  const histograms = Object.keys(RUN_COLUMNS) as RunHistogram[];
  const [perDay, ends, splitLists, runLists] = await Promise.all([
    rawPerDay(range),
    rawEnds(range),
    Promise.all(
      SPLIT_COLUMNS.map(async (column) =>
        (await countBy<string | number | null>(range, 'session', column)).map(({ key, count }) => ({
          key: column === 'kid' ? String(key === 1) : key === null ? null : String(key),
          count,
        })),
      ),
    ),
    Promise.all(histograms.map((name) => countBy<number | null>(range, 'run', RUN_COLUMNS[name]))),
  ]);
  return {
    perDay,
    ends,
    split: Object.fromEntries(SPLIT_COLUMNS.map((column, i) => [column, splitLists[i]!])) as Tallies['split'],
    runs: Object.fromEntries(histograms.map((name, i) => [name, runLists[i]!])) as Tallies['runs'],
  };
}

/** Highscore list rows per day of their `date`. */
async function entriesPerDay({ db, from, to }: Range): Promise<{ day: string; n: number }[]> {
  return (
    await db
      .prepare('SELECT substr(date, 1, 10) AS day, COUNT(*) AS n FROM scores WHERE substr(date, 1, 10) BETWEEN ? AND ? GROUP BY day')
      .bind(from, to)
      .all<{ day: string; n: number }>()
  ).results;
}

function zeroFilled(days: string[], tallies: Tallies['perDay'], entries: { day: string; n: number }[]): DayStats[] {
  const byDay = new Map(days.map((day) => [day, { day, sessions: 0, runs: 0, entries: 0 }]));
  for (const { day, sessions, runs } of tallies) Object.assign(byDay.get(day)!, { sessions, runs });
  for (const { day, n } of entries) byDay.get(day)!.entries = n;
  return [...byDay.values()];
}

export async function loadStats(db: D1Database, days: StatsRange, now: number): Promise<InsightsStats> {
  const fromRaw = days !== ALL_RANGE && days <= RAW_RETENTION_DAYS;
  const dayList = dayRange(now, days === ALL_RANGE ? await allRangeDays(db, now) : days);
  const range: Range = { db, from: dayList[0]!, to: dayList[dayList.length - 1]! };
  const [tallies, entries, top] = await Promise.all([fromRaw ? rawTallies(range) : summaryTallies(range), entriesPerDay(range), topRows(db)]);
  const perDay = zeroFilled(dayList, tallies.perDay, entries);
  const sessions = perDay.reduce((sum, day) => sum + day.sessions, 0);
  const runs = perDay.reduce((sum, day) => sum + day.runs, 0);
  const split = Object.fromEntries(
    SPLIT_COLUMNS.map((column) => [column, mergeSmallGroups(tallies.split[column], LOCATION_SPLITS.has(column) ? MIN_GROUP_SESSIONS : 0)]),
  ) as InsightsStats['split'];
  return {
    days,
    generatedAt: new Date(now).toISOString(),
    perDay,
    sessions: { total: sessions, ...tallies.ends },
    runs: {
      total: runs,
      perSession: sessions === 0 ? 0 : Math.round((runs / sessions) * 100) / 100,
      seconds: histogram(HISTOGRAM_BOUNDS.seconds, tallies.runs.seconds),
      distance: histogram(HISTOGRAM_BOUNDS.distance, tallies.runs.distance),
      score: histogram(HISTOGRAM_BOUNDS.score, tallies.runs.score),
    },
    split,
    topScores: top.map(({ name, score, date }) => ({ name, score, date })),
  };
}
