/** D1 access for triaging one feedback row (its kind and issue, storing an issue, status/reply changes, deleting) and the players' status check. */
import type { FeedbackKind, FeedbackStatusEntry } from './feedback-types';
import type { FeedbackTriage, TriagePatch } from './feedback-triage-types';

/** The row's kind and issue number, or null when there is no such row. */
export function feedbackForIssue(db: D1Database, id: number): Promise<{ kind: FeedbackKind; issue: number | null } | null> {
  return db.prepare('SELECT kind, issue FROM feedback WHERE id = ?').bind(id).first();
}

/** Stores the issue number and sets the status to todo. */
export async function storeIssue(db: D1Database, id: number, issue: number): Promise<void> {
  await db.prepare("UPDATE feedback SET issue = ?, status = 'todo' WHERE id = ?").bind(issue, id).run();
}

/** Applies the patch (only the given fields); the row's triage fields afterwards, or null when there is no such row. */
export async function updateTriage(db: D1Database, id: number, patch: TriagePatch): Promise<FeedbackTriage | null> {
  const status = patch.status !== undefined;
  const reply = patch.reply !== undefined;
  // ?2/?3 say whether the field is set, so a null reply can clear it.
  await db
    .prepare('UPDATE feedback SET status = CASE WHEN ?2 THEN ?3 ELSE status END, reply = CASE WHEN ?4 THEN ?5 ELSE reply END WHERE id = ?1')
    .bind(id, status ? 1 : 0, patch.status ?? null, reply ? 1 : 0, patch.reply ?? null)
    .run();
  return db.prepare('SELECT status, issue, reply FROM feedback WHERE id = ?').bind(id).first<FeedbackTriage>();
}

/** Deletes the row; false when there was none. */
export async function deleteFeedback(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}

/** Status and reply of the rows among `ids` (1..MAX_STATUS_IDS), ascending by id; unknown ids are left out. Reads only. */
export async function feedbackStatuses(db: D1Database, ids: readonly number[]): Promise<FeedbackStatusEntry[]> {
  const { results } = await db
    .prepare(`SELECT id, status, reply FROM feedback WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY id`)
    .bind(...ids)
    .all<FeedbackStatusEntry>();
  return results;
}
