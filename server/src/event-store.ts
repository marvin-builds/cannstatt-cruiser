/**
 * D1 writes for the play statistics: the global daily cap, the once-a-day
 * retention prune and storing one event (day and hour only, never a timestamp).
 */
import { utcDay } from './aggregate';
import type { TelemetryEvent } from './insights-types';
import type { Location } from './location';

/** Accepted events per UTC day across all sessions; more are answered but not stored. */
export const DAILY_EVENT_CAP = 15_000;
export const RUNS_PER_SESSION = 200;
/** Events older than this many days are deleted. */
export const RETENTION_DAYS = 90;
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

/** On the first call of a UTC day: deletes events older than RETENTION_DAYS and past day counters. */
export async function pruneOnceADay(db: D1Database, now: number): Promise<void> {
  const today = utcDay(now);
  const { meta } = await db
    .prepare(
      `INSERT INTO event_meta (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value <> excluded.value`,
    )
    .bind(PRUNED_KEY, today)
    .run();
  if (meta.changes === 0) return;
  await db.batch([
    db.prepare('DELETE FROM events WHERE day < ?').bind(utcDay(now - RETENTION_DAYS * DAY_MS)),
    db.prepare('DELETE FROM event_days WHERE day < ?').bind(today),
  ]);
}

/**
 * Stores the event: a session once (with `location`, which other kinds never store), a run while the
 * session has fewer than RUNS_PER_SESSION, an end as the session's largest value.
 */
export async function saveEvent(db: D1Database, event: TelemetryEvent, { day, hour }: Arrival, location: Location): Promise<void> {
  switch (event.kind) {
    case 'session':
      await db
        .prepare(
          `INSERT OR IGNORE INTO events (session, kind, day, hour, version, input, orientation, platform, kid, country, region, city)
           VALUES (?, 'session', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(event.session, day, hour, event.version, event.input, event.orientation, event.platform, Number(event.kid),
          location.country, location.region, location.city)
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
