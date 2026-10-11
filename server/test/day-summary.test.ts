import { beforeEach, describe, expect, it } from 'vitest';
import { utcDay } from '../src/aggregate';
import { MAX_CONDENSE_DAYS } from '../src/day-summary';
import { condenseAndPruneOnceADay } from '../src/event-store';
import { FakeD1 } from './d1-fake';

const NOW = Date.parse('2026-10-11T14:37:21Z');
const DAY_MS = 24 * 3600_000;

let db: FakeD1;
let next = 0;
const sessionId = () => (next++).toString(16).padStart(32, '0');

function seedSession(day: string, values: { input?: string; kid?: number; city?: string | null } = {}): void {
  db.sqlite
    .prepare(
      `INSERT INTO events (session, kind, day, hour, version, input, orientation, platform, kid, country, region, city)
       VALUES (?, 'session', ?, 9, '2026-10-11.1', ?, 'landscape', 'android', ?, 'DE', 'Baden-Württemberg', ?)`,
    )
    .run(sessionId(), day, values.input ?? 'touch', values.kid ?? 0, values.city === undefined ? 'Stuttgart' : values.city);
}

function seedRun(day: string, seconds: number, distance: number, score: number): void {
  db.sqlite
    .prepare("INSERT INTO events (session, kind, day, hour, kid, seconds, distance_bucket, score_bucket) VALUES (?, 'run', ?, 10, 0, ?, ?, ?)")
    .run(sessionId(), day, seconds, distance, score);
}

function seedEnd(day: string, seconds: number): void {
  db.sqlite.prepare("INSERT INTO events (session, kind, day, hour, seconds) VALUES (?, 'end', ?, 10, ?)").run(sessionId(), day, seconds);
}

type Row = { day: string; metric: string; key: string; value: number };
const summaries = (where = '1 = 1'): Row[] =>
  db.sqlite.prepare(`SELECT day, metric, key, value FROM day_summaries WHERE ${where} ORDER BY day, metric, key`).all() as Row[];
const value = (day: string, metric: string, key: string) => summaries(`day = '${day}' AND metric = '${metric}' AND key = '${key}'`)[0]?.value;
const rawDays = () => (db.sqlite.prepare('SELECT DISTINCT day FROM events ORDER BY day').all() as { day: string }[]).map((row) => row.day);

beforeEach(() => {
  db = new FakeD1();
});

describe('condensing finished days into day_summaries', () => {
  it('stores totals, splits and run buckets per finished day, without ids or hours', async () => {
    seedSession('2026-10-10', { input: 'keys', kid: 1 });
    seedSession('2026-10-10', { city: null });
    seedSession('2026-10-10');
    seedRun('2026-10-10', 120, 1300, 500);
    seedRun('2026-10-10', 120, 0, 0);
    seedRun('2026-10-10', 30, 0, 0);
    for (const seconds of [300, 30, 120, 60]) seedEnd('2026-10-10', seconds);
    await condenseAndPruneOnceADay(db.asD1(), NOW);

    const day = '2026-10-10';
    expect(summaries(`metric = 'total'`)).toEqual([
      { day, metric: 'total', key: 'end_median', value: 90 },
      { day, metric: 'total', key: 'end_seconds', value: 510 },
      { day, metric: 'total', key: 'ends', value: 4 },
      { day, metric: 'total', key: 'runs', value: 3 },
      { day, metric: 'total', key: 'sessions', value: 3 },
    ]);
    expect(summaries(`metric = 'input'`).map((r) => [r.key, r.value])).toEqual([['keys', 1], ['touch', 2]]);
    expect(summaries(`metric = 'kid'`).map((r) => [r.key, r.value])).toEqual([['false', 2], ['true', 1]]);
    // Unknown places are stored with the empty key.
    expect(summaries(`metric = 'city'`).map((r) => [r.key, r.value])).toEqual([['', 1], ['Stuttgart', 2]]);
    expect(value(day, 'country', 'DE')).toBe(3);
    expect(value(day, 'region', 'Baden-Württemberg')).toBe(3);
    expect(value(day, 'orientation', 'landscape')).toBe(3);
    expect(value(day, 'platform', 'android')).toBe(3);
    expect(value(day, 'version', '2026-10-11.1')).toBe(3);
    expect(summaries(`metric = 'run_seconds'`).map((r) => [r.key, r.value])).toEqual([['120', 2], ['30', 1]]);
    expect(summaries(`metric = 'run_distance'`).map((r) => [r.key, r.value])).toEqual([['0', 2], ['1300', 1]]);
    expect(summaries(`metric = 'run_score'`).map((r) => [r.key, r.value])).toEqual([['0', 2], ['500', 1]]);
    const columns = db.sqlite.prepare("SELECT name FROM pragma_table_info('day_summaries')").all().map((row) => (row as { name: string }).name);
    expect(columns).toEqual(['day', 'metric', 'key', 'value']);
  });

  it('takes the middle value as the median of an odd day', async () => {
    for (const seconds of [10, 50, 20]) seedEnd('2026-10-09', seconds);
    await condenseAndPruneOnceADay(db.asD1(), NOW);
    expect(value('2026-10-09', 'total', 'end_median')).toBe(20);
  });

  it('never summarises today, and gives a day without events no rows', async () => {
    seedSession('2026-10-11');
    seedSession('2026-10-08');
    await condenseAndPruneOnceADay(db.asD1(), NOW);
    expect([...new Set(summaries().map((row) => row.day))]).toEqual(['2026-10-08']);
    expect(value('2026-10-08', 'total', 'runs')).toBe(0);
    expect(value('2026-10-08', 'total', 'ends')).toBe(0);
  });

  it('runs at most once per UTC day and never counts a day twice', async () => {
    seedSession('2026-10-10');
    await condenseAndPruneOnceADay(db.asD1(), NOW);
    const first = summaries();
    seedSession('2026-10-10'); // would change the count if the day were summarised again
    await condenseAndPruneOnceADay(db.asD1(), NOW + 3600_000);
    expect(summaries()).toEqual(first);
    await condenseAndPruneOnceADay(db.asD1(), NOW + DAY_MS);
    expect(value('2026-10-10', 'total', 'sessions')).toBe(1);
    expect(value('2026-10-11', 'total', 'sessions')).toBeUndefined();
  });

  it('summarises every older day on its first run, before the prune deletes them', async () => {
    seedSession('2026-06-01'); // older than the raw retention
    seedRun('2026-06-01', 60, 100, 100);
    seedSession('2026-07-12');
    seedSession('2026-09-30');
    await condenseAndPruneOnceADay(db.asD1(), NOW);
    expect(rawDays()).toEqual(['2026-09-30']);
    expect(value('2026-06-01', 'total', 'sessions')).toBe(1);
    expect(value('2026-06-01', 'run_distance', '100')).toBe(1);
    expect(value('2026-07-12', 'total', 'sessions')).toBe(1);
    expect(value('2026-09-30', 'total', 'sessions')).toBe(1);
  });

  it(`does at most ${MAX_CONDENSE_DAYS} days per run and keeps raw rows of days not summarised yet`, async () => {
    const start = Date.parse('2026-03-01T12:00:00Z');
    const days = Array.from({ length: 150 }, (_, i) => utcDay(start + i * DAY_MS));
    for (const day of days) seedSession(day);
    await condenseAndPruneOnceADay(db.asD1(), NOW);
    const summarised = [...new Set(summaries().map((row) => row.day))];
    expect(summarised).toEqual(days.slice(0, MAX_CONDENSE_DAYS));
    expect(rawDays()).toEqual(days.slice(MAX_CONDENSE_DAYS));

    await condenseAndPruneOnceADay(db.asD1(), NOW + DAY_MS);
    expect([...new Set(summaries().map((row) => row.day))]).toEqual(days);
    expect(rawDays()).toEqual(days.filter((day) => day >= '2026-07-14'));
    expect(summaries(`metric = 'total' AND key = 'sessions'`).every((row) => row.value === 1)).toBe(true);
  });

  it('skips gaps without events', async () => {
    seedSession('2026-01-01');
    seedSession('2026-10-01');
    await condenseAndPruneOnceADay(db.asD1(), NOW);
    expect([...new Set(summaries().map((row) => row.day))]).toEqual(['2026-01-01', '2026-10-01']);
  });
});
