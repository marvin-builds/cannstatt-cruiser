/**
 * D1 access: the top list, a device's recent submissions and best row, and
 * saving a run (keep it if it is the device's new best, log the submission,
 * drop day-old log rows, prune to KEEP_ROWS).
 */
import { PRUNE_QUERY, TOP_QUERY, type ScoreRow } from './ranking';
import { DAY_MS } from './rate-limit';
import type { Submission } from './submission';

export async function topRows(db: D1Database): Promise<ScoreRow[]> {
  return (await db.prepare(TOP_QUERY).all<ScoreRow>()).results;
}

/** Times (ms) of the device's accepted submissions within the last day. */
export async function recentSubmissions(db: D1Database, deviceHash: string, now: number): Promise<number[]> {
  const { results } = await db.prepare('SELECT at FROM submissions WHERE device = ? AND at > ?').bind(deviceHash, now - DAY_MS).all<{ at: number }>();
  return results.map((row) => row.at);
}

/** The device's row (its best run), or null when it has none. */
export async function deviceRow(db: D1Database, deviceHash: string): Promise<{ id: number; score: number } | null> {
  return db.prepare('SELECT id, score FROM scores WHERE device = ?').bind(deviceHash).first<{ id: number; score: number }>();
}

/**
 * Inserts the run as the device's row, or overwrites that row in place when
 * the run scores higher; an equal or lower run changes nothing. The
 * submission is logged for the rate limit either way. Returns whether the
 * run was written.
 */
export async function saveBestRun(db: D1Database, run: Submission, deviceHash: string, now: number): Promise<boolean> {
  const [saved] = await db.batch([
    db
      .prepare(
        `INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (device) DO UPDATE SET name = excluded.name, score = excluded.score, distance = excluded.distance,
           duration = excluded.duration, version = excluded.version, date = excluded.date
         WHERE excluded.score > scores.score`,
      )
      .bind(run.name, run.score, run.distance, run.duration, run.version, new Date(now).toISOString(), deviceHash),
    db.prepare('INSERT INTO submissions (device, at) VALUES (?, ?)').bind(deviceHash, now),
    db.prepare('DELETE FROM submissions WHERE at <= ?').bind(now - DAY_MS),
    db.prepare(PRUNE_QUERY),
  ]);
  return saved!.meta.changes > 0;
}

/** Hex SHA-256 of a secret (device id, session id, feedback key), so the raw value is never stored. */
export async function sha256Hex(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
