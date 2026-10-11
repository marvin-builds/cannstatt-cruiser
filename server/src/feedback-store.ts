/**
 * D1 access for player feedback: storing one report under the per-session and
 * global daily limits, the once-a-day retention prune, and the board's list.
 * Stores the UTC day only; the session id is kept only as a SHA-256 in the
 * day's counter table, never next to the text.
 */
import { utcDay } from './aggregate';
import { FEEDBACK_LIST_LIMIT, FEEDBACK_PER_SESSION_PER_DAY, FEEDBACK_RETENTION_DAYS } from './feedback-rules';
import type { FeedbackBody, FeedbackEntry, FeedbackKind } from './feedback-types';
import type { InputKind, Orientation, Platform } from './insights-types';

/** Accepted feedback per UTC day across all sessions. */
export const FEEDBACK_DAILY_CAP = 200;
/** The counter row of a day that counts every session ('all' is never a SHA-256 hex). */
const ALL_SESSIONS = 'all';
const PRUNED_KEY = 'feedback-pruned';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stores the feedback unless the session (by `sessionHash`) or all sessions together reached the
 * day's limit; false when it was not stored. One transaction: the session counter always counts
 * the attempt, the global counter only attempts within the session limit (so one session cannot
 * use up the global cap), and the row is inserted only while both counters are within their limits.
 */
export async function saveFeedback(db: D1Database, feedback: FeedbackBody, sessionHash: string, day: string): Promise<boolean> {
  const sessionCount = 'SELECT count FROM feedback_counts WHERE day = ?1 AND session_hash = ?2';
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO feedback_counts (day, session_hash, count) VALUES (?1, ?2, 1)
         ON CONFLICT (day, session_hash) DO UPDATE SET count = count + 1`,
      )
      .bind(day, sessionHash),
    db
      .prepare(
        `INSERT INTO feedback_counts (day, session_hash, count) SELECT ?1, ?3, 1 WHERE (${sessionCount}) <= ?4
         ON CONFLICT (day, session_hash) DO UPDATE SET count = count + 1`,
      )
      .bind(day, sessionHash, ALL_SESSIONS, FEEDBACK_PER_SESSION_PER_DAY),
    db
      .prepare(
        `INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
         SELECT ?1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
         WHERE (${sessionCount}) <= ?4 AND (SELECT count FROM feedback_counts WHERE day = ?1 AND session_hash = ?3) <= ?13`,
      )
      .bind(day, sessionHash, ALL_SESSIONS, FEEDBACK_PER_SESSION_PER_DAY, feedback.kind, feedback.text, feedback.version,
        feedback.platform, feedback.input, feedback.orientation, feedback.viewWidth, JSON.stringify(feedback.log), FEEDBACK_DAILY_CAP),
  ]);
  return (results[2] as D1Result).meta.changes > 0;
}

/**
 * On the first call of a UTC day, in one transaction: deletes feedback older than
 * FEEDBACK_RETENTION_DAYS and the counters of past days, and marks the day as done. A failed run
 * leaves the mark unset, so the next call retries; the deletes are idempotent.
 */
export async function pruneFeedbackOnceADay(db: D1Database, now: number): Promise<void> {
  const today = utcDay(now);
  const done = await db.prepare('SELECT value FROM event_meta WHERE key = ?').bind(PRUNED_KEY).first<{ value: string }>();
  if (done?.value === today) return;
  await db.batch([
    db.prepare('DELETE FROM feedback WHERE day < ?').bind(utcDay(now - FEEDBACK_RETENTION_DAYS * DAY_MS)),
    db.prepare('DELETE FROM feedback_counts WHERE day < ?').bind(today),
    db
      .prepare('INSERT INTO event_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .bind(PRUNED_KEY, today),
  ]);
}

interface FeedbackRow {
  id: number;
  day: string;
  kind: FeedbackKind;
  text: string;
  version: string;
  platform: Platform;
  input: InputKind;
  orientation: Orientation;
  view_width: number;
  log: string;
}

/** The newest FEEDBACK_LIST_LIMIT entries (day, then id descending) with the log parsed back. */
export async function listFeedback(db: D1Database): Promise<FeedbackEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT id, day, kind, text, version, platform, input, orientation, view_width, log
       FROM feedback ORDER BY day DESC, id DESC LIMIT ?`,
    )
    .bind(FEEDBACK_LIST_LIMIT)
    .all<FeedbackRow>();
  return results.map(({ view_width, log, ...row }) => ({ ...row, viewWidth: view_width, log: JSON.parse(log) as string[] }));
}
