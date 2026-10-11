/**
 * The GET /stats answer: aggregates over the events of the last `days` UTC
 * days (today included) and the scores table. Never returns raw rows.
 */
import { dayRange, histogram, mergeSmallGroups } from './aggregate';
import { DISTANCE_STEP_M, MAX_DISTANCE_M, MIN_GROUP_SESSIONS, SCORE_BUCKETS } from './events';
import type { CountEntry, DayStats, InsightsStats, StatsRange } from './insights-types';
import { topRows } from './store';

/** Lower bounds (seconds) of the run length histogram. */
const RUN_SECONDS_HISTOGRAM = [0, 30, 60, 180, 600] as const;
const DISTANCE_BOUNDS = Array.from({ length: MAX_DISTANCE_M / DISTANCE_STEP_M + 1 }, (_, i) => i * DISTANCE_STEP_M);

/** Session columns split by attribute; the location ones get small groups merged. */
const SPLITS = ['input', 'orientation', 'platform', 'kid', 'version', 'country', 'region', 'city'] as const;
const LOCATION_SPLITS: ReadonlySet<string> = new Set(['country', 'region', 'city']);
/** Run columns with a histogram. */
type RunColumn = 'seconds' | 'distance_bucket' | 'score_bucket';
type Column = (typeof SPLITS)[number] | RunColumn;

type Key = string | number | null;

interface Range {
  db: D1Database;
  from: string;
  to: string;
}

/** COUNT per value of `column` over the `kind` rows of the range. `column` comes from a fixed list. */
async function countBy<K extends Key>({ db, from, to }: Range, kind: 'session' | 'run', column: Column): Promise<{ key: K; count: number }[]> {
  const sql = `SELECT ${column} AS key, COUNT(*) AS count FROM events WHERE day BETWEEN ? AND ? AND kind = ? GROUP BY ${column}`;
  return (await db.prepare(sql).bind(from, to, kind).all<{ key: K; count: number }>()).results;
}

async function perDay(range: Range, days: string[]): Promise<DayStats[]> {
  const { db, from, to } = range;
  const [events, entries] = await Promise.all([
    db
      .prepare("SELECT day, kind, COUNT(*) AS n FROM events WHERE day BETWEEN ? AND ? AND kind IN ('session', 'run') GROUP BY day, kind")
      .bind(from, to)
      .all<{ day: string; kind: 'session' | 'run'; n: number }>(),
    db
      .prepare('SELECT substr(date, 1, 10) AS day, COUNT(*) AS n FROM scores WHERE substr(date, 1, 10) BETWEEN ? AND ? GROUP BY day')
      .bind(from, to)
      .all<{ day: string; n: number }>(),
  ]);
  const byDay = new Map(days.map((day) => [day, { day, sessions: 0, runs: 0, entries: 0 }]));
  for (const row of events.results) byDay.get(row.day)![row.kind === 'session' ? 'sessions' : 'runs'] = row.n;
  for (const row of entries.results) byDay.get(row.day)!.entries = row.n;
  return [...byDay.values()];
}

/** Median and average of the sessions' `end` seconds, whole seconds; 0 without ends. */
async function sessionSeconds({ db, from, to }: Range): Promise<{ medianSeconds: number; avgSeconds: number }> {
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

async function splits(range: Range): Promise<InsightsStats['split']> {
  const lists = await Promise.all(
    SPLITS.map(async (column): Promise<CountEntry[]> => {
      const rows = await countBy<string | number | null>(range, 'session', column);
      const named = rows.map(({ key, count }) => ({ key: column === 'kid' ? String(key === 1) : key === null ? null : String(key), count }));
      return LOCATION_SPLITS.has(column) ? mergeSmallGroups(named, MIN_GROUP_SESSIONS) : mergeSmallGroups(named, 0);
    }),
  );
  return Object.fromEntries(SPLITS.map((column, i) => [column, lists[i]!])) as InsightsStats['split'];
}

export async function loadStats(db: D1Database, days: StatsRange, now: number): Promise<InsightsStats> {
  const dayList = dayRange(now, days);
  const range: Range = { db, from: dayList[0]!, to: dayList[dayList.length - 1]! };
  const [daily, seconds, runSeconds, runDistance, runScore, split, top] = await Promise.all([
    perDay(range, dayList),
    sessionSeconds(range),
    countBy<number | null>(range, 'run', 'seconds'),
    countBy<number | null>(range, 'run', 'distance_bucket'),
    countBy<number | null>(range, 'run', 'score_bucket'),
    splits(range),
    topRows(db),
  ]);
  const sessions = daily.reduce((sum, day) => sum + day.sessions, 0);
  const runs = daily.reduce((sum, day) => sum + day.runs, 0);
  return {
    days,
    generatedAt: new Date(now).toISOString(),
    perDay: daily,
    sessions: { total: sessions, ...seconds },
    runs: {
      total: runs,
      perSession: sessions === 0 ? 0 : Math.round((runs / sessions) * 100) / 100,
      seconds: histogram(RUN_SECONDS_HISTOGRAM, runSeconds),
      distance: histogram(DISTANCE_BOUNDS, runDistance),
      score: histogram(SCORE_BUCKETS, runScore),
    },
    split,
    topScores: top.map(({ name, score, date }) => ({ name, score, date })),
  };
}
