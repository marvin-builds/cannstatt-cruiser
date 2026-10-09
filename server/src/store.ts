/**
 * D1 access: the top list, a device's recent submissions and saving a run
 * (insert, log the submission, drop day-old log rows, prune to KEEP_ROWS).
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

/** Saves the run and returns its row id. */
export async function saveRun(db: D1Database, run: Submission, deviceHash: string, now: number): Promise<number> {
  const [inserted] = await db.batch([
    db
      .prepare('INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(run.name, run.score, run.distance, run.duration, run.version, new Date(now).toISOString(), deviceHash),
    db.prepare('INSERT INTO submissions (device, at) VALUES (?, ?)').bind(deviceHash, now),
    db.prepare('DELETE FROM submissions WHERE at <= ?').bind(now - DAY_MS),
    db.prepare(PRUNE_QUERY),
  ]);
  return inserted!.meta.last_row_id;
}

/** Hex SHA-256 of the device id, so the raw id is never stored. */
export async function hashDevice(device: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(device));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
