/**
 * D1 access for triaging one feedback row (its kind and issue, storing an issue, status/reply/version changes, deleting)
 * and the players' status check and delete by id and key hash.
 */
import type { FeedbackKind, FeedbackStatusEntry } from './feedback-types';
import type { FeedbackStatus, FeedbackTriage, IssueState, TriagePatch } from './feedback-triage-types';
import type { IssueReading } from './github';

/** The triage fields as the board and the PATCH answer name them. */
const TRIAGE_COLUMNS = 'status, issue, reply, done_version AS doneVersion, issue_state AS issueState, issue_closed_day AS issueClosedDay';

/** The row's kind, issue number and stored issue state, or null when there is no such row. */
export function feedbackForIssue(db: D1Database, id: number): Promise<{ kind: FeedbackKind; issue: number | null; issueState: IssueState | null } | null> {
  return db.prepare('SELECT kind, issue, issue_state AS issueState FROM feedback WHERE id = ?').bind(id).first();
}

/** An issue to store on a row: its number, its state as read (a new one is open) and, when given, the player message. */
export interface LinkedIssue {
  issue: number;
  reading: IssueReading;
  /** Undefined keeps the row's reply; null clears it. */
  reply?: string | null;
}

/** Stores the issue with its state and sets the status to todo (which clears a done version); the reply only when given. */
export async function storeIssue(db: D1Database, id: number, { issue, reading, reply }: LinkedIssue): Promise<void> {
  await db
    .prepare(
      `UPDATE feedback SET issue = ?2, issue_state = ?3, issue_closed_day = ?4, status = 'todo', done_version = NULL,
         reply = CASE WHEN ?5 THEN ?6 ELSE reply END WHERE id = ?1`,
    )
    .bind(id, issue, reading.state, reading.closedDay, reply === undefined ? 0 : 1, reply ?? null)
    .run();
}

/**
 * Applies the patch (only the given fields); the row's triage fields afterwards, or null when there is no such row.
 * A status patch always sets the done version: the given one with status done, else null.
 */
export async function updateTriage(db: D1Database, id: number, patch: TriagePatch): Promise<FeedbackTriage | null> {
  const status = patch.status !== undefined;
  const reply = patch.reply !== undefined;
  // ?2/?4 say whether the field is set, so a null reply can clear it.
  await db
    .prepare(
      `UPDATE feedback SET status = CASE WHEN ?2 THEN ?3 ELSE status END, reply = CASE WHEN ?4 THEN ?5 ELSE reply END,
         done_version = CASE WHEN ?2 THEN ?6 ELSE done_version END WHERE id = ?1`,
    )
    .bind(id, status ? 1 : 0, patch.status ?? null, reply ? 1 : 0, patch.reply ?? null, patch.status === 'done' ? (patch.doneVersion ?? null) : null)
    .run();
  return db.prepare(`SELECT ${TRIAGE_COLUMNS} FROM feedback WHERE id = ?`).bind(id).first<FeedbackTriage>();
}

/** Deletes the row; false when there was none. */
export async function deleteFeedback(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}

/**
 * Status, reply and done version of the rows whose id and key hash both match one of `items` (1..MAX_STATUS_ITEMS),
 * ascending by id; unknown ids, rows without a key hash and wrong keys are left out. One query, reads only.
 */
export async function feedbackStatuses(db: D1Database, items: readonly { id: number; keyHash: string }[]): Promise<FeedbackStatusEntry[]> {
  const matches = items.map((_, i) => `(id = ?${2 * i + 1} AND key_hash = ?${2 * i + 2})`).join(' OR ');
  const { results } = await db
    .prepare(`SELECT id, status, reply, done_version FROM feedback WHERE ${matches} ORDER BY id`)
    .bind(...items.flatMap(({ id, keyHash }) => [id, keyHash]))
    .all<{ id: number; status: FeedbackStatus; reply: string | null; done_version: string | null }>();
  return results.map(({ id, status, reply, done_version }) => ({ id, status, reply, doneVersion: done_version }));
}

/** Deletes the row only when its key hash matches (ROADMAP 78); false when no row matched (unknown id, wrong key, no key). */
export async function deleteOwnFeedback(db: D1Database, id: number, keyHash: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM feedback WHERE id = ? AND key_hash = ?').bind(id, keyHash).run();
  return result.meta.changes > 0;
}
