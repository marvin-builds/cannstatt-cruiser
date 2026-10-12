/**
 * D1 writes for the play statistics: the global daily cap, the once-a-day
 * condense and retention prune and storing one event (day and hour only, never a timestamp).
 */
import { utcDay } from './aggregate';
import { condenseStatements } from './day-summary';
import { RAW_RETENTION_DAYS } from './events';
import type { TelemetryEvent } from './insights-types';
import type { Location } from './location';

/** Accepted events per UTC day across all sessions; more are answered but not stored. */
export const DAILY_EVENT_CAP = 15_000;
export const RUNS_PER_SESSION = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRUNED_KEY = 'pruned';

/** When an event arrived: UTC day and hour only. */
export interface Arrival {
  day: string;
  hour: number;
}

/** Counts one event against the day's cap; false (and nothing written) when the cap is reached. */
export async function claimDailySlot(db: D1Database, day: string): Promise<boolean> {
  const { meta } = await db
    .prepare(
      `INSERT INTO event_days (day, accepted) VALUES (?, 1)
       ON CONFLICT (day) DO UPDATE SET accepted = accepted + 1 WHERE accepted < ?`,
    )
    .bind(day, DAILY_EVENT_CAP)
    .run();
  return meta.changes > 0;
}

/**
 * On the first call of a UTC day, in one transaction: summarises the finished days not summarised
 * yet (see day-summary.ts), then deletes events older than RAW_RETENTION_DAYS (only of summarised
 * days, so no day is lost) and past day counters, and marks the day as done. The mark is written in
 * the same transaction, so a failed run leaves it unset and the next call retries; two calls racing
 * on the first event of a day are harmless (INSERT OR IGNORE, idempotent deletes).
 */
export async function condenseAndPruneOnceADay(db: D1Database, now: number): Promise<void> {
  const today = utcDay(now);
  const done = await db.prepare('SELECT value FROM event_meta WHERE key = ?').bind(PRUNED_KEY).first<{ value: string }>();
  if (done?.value === today) return;
  await db.batch([
    ...(await condenseStatements(db, today)),
    db
      .prepare("DELETE FROM events WHERE day < ? AND day <= COALESCE((SELECT MAX(day) FROM day_summaries), '')")
      .bind(utcDay(now - RAW_RETENTION_DAYS * DAY_MS)),
    db.prepare('DELETE FROM event_days WHERE day < ?').bind(today),
    db
      .prepare('INSERT INTO event_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .bind(PRUNED_KEY, today),
  ]);
}

/**
 * Stores the event: a session once (with `location`, which other kinds never store, and its flags:
 * tester 1/0 with omitted = 0, is_returning 1/0 with omitted = NULL, unknown), a run while the
 * session has fewer than RUNS_PER_SESSION, an end as the session's largest value.
 */
export async function saveEvent(db: D1Database, event: TelemetryEvent, { day, hour }: Arrival, location: Location): Promise<void> {
  switch (event.kind) {
    case 'session':
      await db
        .prepare(
          `INSERT OR IGNORE INTO events
             (session, kind, day, hour, version, input, platform, kid, country, region, city, tester, is_returning)
           VALUES (?, 'session', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(event.session, day, hour, event.version, event.input, event.platform, Number(event.kid),
          location.country, location.region, location.city, Number(event.tester === true),
          event.returning === undefined ? null : Number(event.returning))
        .run();
      return;
    case 'run':
      await db
        .prepare(
          `INSERT INTO events (session, kind, day, hour, kid, seconds, score_bucket, distance_bucket)
           SELECT ?, 'run', ?, ?, ?, ?, ?, ?
           WHERE (SELECT COUNT(*) FROM events WHERE session = ? AND kind = 'run') < ?`,
        )
        .bind(event.session, day, hour, Number(event.kid), event.seconds, event.score, event.distance, event.session, RUNS_PER_SESSION)
        .run();
      return;
    case 'end':
      await db
        .prepare(
          `INSERT INTO events (session, kind, day, hour, seconds) VALUES (?, 'end', ?, ?, ?)
           ON CONFLICT (session, kind) WHERE kind IN ('session', 'end') DO UPDATE SET seconds = MAX(seconds, excluded.seconds)`,
        )
        .bind(event.session, day, hour, event.seconds)
        .run();
      return;
  }
}
