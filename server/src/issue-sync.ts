/**
 * Keeps the GitHub issue states of the board's tickets fresh (ROADMAP 82): on a board load, at most once per
 * ISSUE_SYNC_INTERVAL_MS, one list read of the recently updated issues plus a few single reads for linked issues
 * not in it, stored into D1. A failing or slow GitHub leaves the stored states as they are.
 */
import { listIssueStates, readIssue, type GitHubFetch, type IssueReading } from './github';

export const ISSUE_SYNC_INTERVAL_MS = 60_000;
/** Linked issues missing from the list answer that are read one by one per sync (in parallel). */
export const MAX_SINGLE_ISSUE_READS = 10;
/** event_meta key holding the time (ms) of the last sync attempt. */
const READ_KEY = 'issues-read';
const MISSING: IssueReading = { state: 'missing', closedDay: null };

/**
 * Claims the interval (an attempt counts, so a failing GitHub is not asked on every load), then reads and stores.
 * Never throws for GitHub; database errors reach the caller.
 */
export async function syncIssueStates(db: D1Database, github: GitHubFetch, token: string, now: number): Promise<void> {
  const last = await db.prepare('SELECT value FROM event_meta WHERE key = ?').bind(READ_KEY).first<{ value: string }>();
  if (last && now - Number(last.value) < ISSUE_SYNC_INTERVAL_MS) return;
  await db
    .prepare('INSERT INTO event_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(READ_KEY, String(now))
    .run();
  // Never-read issues first, so a new link gets its state even when more than MAX_SINGLE_ISSUE_READS are missing from the list.
  const { results: linked } = await db
    .prepare('SELECT issue FROM feedback WHERE issue IS NOT NULL GROUP BY issue ORDER BY MIN(issue_state IS NOT NULL), issue')
    .all<{ issue: number }>();
  if (!linked.length) return;
  const listed = await listIssueStates(github, token);
  if (!listed) return;
  const linkedIssues = new Set(linked.map(({ issue }) => issue));
  const readings = new Map([...listed].filter(([issue]) => linkedIssues.has(issue)));
  const unlisted = linked.filter(({ issue }) => !listed.has(issue)).slice(0, MAX_SINGLE_ISSUE_READS);
  const lookups = await Promise.all(unlisted.map(async ({ issue }) => [issue, await readIssue(github, token, issue)] as const));
  for (const [issue, lookup] of lookups) {
    if (lookup.kind !== 'error') readings.set(issue, lookup.kind === 'issue' ? lookup.reading : MISSING);
  }
  if (!readings.size) return;
  await db.batch(
    [...readings].map(([issue, { state, closedDay }]) =>
      db.prepare('UPDATE feedback SET issue_state = ?, issue_closed_day = ? WHERE issue = ?').bind(state, closedDay, issue)),
  );
}
