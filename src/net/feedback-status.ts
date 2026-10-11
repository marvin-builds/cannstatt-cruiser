/**
 * "Mein Feedback" (ROADMAP 70): the reports sent from this device
 * (feedback-reports.ts) with what happened to them. No account and no device
 * id: on visiting the title the game asks `POST /feedback/status` with each
 * kept report's id and secret key (the body, never the URL), at most once per
 * STATUS_CHECK_SPACING_MS (kept in the store, so a reload does not ask again
 * at once), online only, through the feedback sender's gate
 * (feedbackBaseUrl: the live host in a production build or an injected test
 * URL). The answer is kept; a report the worker leaves out is 'removed' and
 * never asked about again. The red dot shows while a report's status, reply or
 * done version differs from what the player last saw in "Mein Feedback".
 * Tests use a fake fetch.
 */
import type { Store } from '../core/storage';
import { type FetchLike, REQUEST_TIMEOUT_MS } from './api';
import {
  dropLegacyFeedbackKeys,
  isFeedbackId,
  keepReport,
  type KeptReport,
  loadReports,
  reportChanged,
  reportSignature,
  saveReports,
  type SentReport,
} from './feedback-reports';
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
  type FeedbackStatusEntry,
  type FeedbackStatusQuery,
  MAX_REPLY_CHARS,
  MAX_STATUS_ITEMS,
} from './feedback-types';
import { VERSION_PATTERN } from './telemetry-types';
import { jsonBody, timedFetch } from './timed-fetch';

/** The status is asked at most this often (ms), also across reloads. */
export const STATUS_CHECK_SPACING_MS = 60_000;
/** Store key of the last check's time (ms since 1970). */
export const FEEDBACK_CHECKED_AT_KEY = 'feedbackCheckedAt';

/** A valid answer row for one of `asked`, the reply capped and a malformed version dropped; else null. */
function parseEntry(v: unknown, asked: readonly number[]): FeedbackStatusEntry | null {
  if (typeof v !== 'object' || v === null) return null;
  const { id, status, reply, doneVersion } = v as Record<string, unknown>;
  if (!isFeedbackId(id) || !asked.includes(id) || !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) return null;
  if (reply !== null && typeof reply !== 'string') return null;
  const version = typeof doneVersion === 'string' && VERSION_PATTERN.test(doneVersion) ? doneVersion : null;
  return { id, status: status as FeedbackStatus, reply: reply === null ? null : reply.slice(0, MAX_REPLY_CHARS), doneVersion: version };
}

/** The valid rows of an answer, or null when it is not one. */
function parseAnswer(body: unknown, asked: readonly number[]): FeedbackStatusEntry[] | null {
  const entries = (body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return null;
  return entries.map((e) => parseEntry(e, asked)).filter((e): e is FeedbackStatusEntry => e !== null);
}

export interface FeedbackInboxDeps {
  /** From feedbackBaseUrl; null asks nothing. */
  baseUrl: string | null;
  fetch: FetchLike;
  store: Store;
  now: () => number;
  /** navigator.onLine */
  online: () => boolean;
  timeoutMs?: number;
}

/** The part the ui uses. */
export type FeedbackInboxLike = Pick<FeedbackInbox, 'reports' | 'changed' | 'changedIds' | 'markSeen' | 'checkIfDue'>;

export class FeedbackInbox {
  private kept: KeptReport[];
  private asking = false;

  constructor(private readonly deps: FeedbackInboxDeps) {
    dropLegacyFeedbackKeys(deps.store);
    this.kept = loadReports(deps.store);
  }

  /** The kept reports, newest first. */
  get reports(): readonly KeptReport[] {
    return [...this.kept].reverse();
  }

  /** Something changed since the player last opened "Mein Feedback" (the red dot). */
  get changed(): boolean {
    return this.kept.some(reportChanged);
  }

  /** The ids of the changed reports, newest first. */
  changedIds(): number[] {
    return this.reports.filter(reportChanged).map((r) => r.id);
  }

  /** "Mein Feedback" was opened: everything as it is now counts as seen. */
  markSeen(): void {
    if (!this.changed) return;
    this.save(this.kept.map((r) => ({ ...r, seen: reportSignature(r) })));
  }

  /** A report the worker just stored. */
  add(sent: SentReport): void {
    this.kept = keepReport(this.deps.store, sent);
  }

  /**
   * Asks for the kept reports' status unless it did in the last minute (a failed try counts too),
   * none is left to ask about, the device is offline or there is no endpoint. Never throws.
   */
  async checkIfDue(): Promise<void> {
    const { baseUrl, now } = this.deps;
    const asked = this.kept.filter((r) => r.status !== 'removed').slice(-MAX_STATUS_ITEMS);
    if (this.asking || baseUrl === null || asked.length === 0 || !this.due() || !this.deps.online()) return;
    this.asking = true;
    this.deps.store.set(FEEDBACK_CHECKED_AT_KEY, now());
    const query: FeedbackStatusQuery = { items: asked.map(({ id, key }) => ({ id, key })) };
    // text/plain keeps it a simple CORS request.
    const init = { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(query) };
    try {
      const response = await timedFetch(this.deps.fetch, `${baseUrl}/feedback/status`, init, this.deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
      const ids = asked.map((r) => r.id);
      const entries = response?.status === 200 ? parseAnswer(await jsonBody(response), ids) : null;
      if (entries === null) return;
      this.save(
        this.kept.map((r) => {
          if (!ids.includes(r.id)) return r;
          const entry = entries.find((e) => e.id === r.id);
          // Left out: deleted, pruned or never stored with this key; nothing will change for it any more.
          return entry ? { ...r, status: entry.status, reply: entry.reply, doneVersion: entry.doneVersion } : { ...r, status: 'removed', reply: null, doneVersion: null };
        }),
      );
    } finally {
      this.asking = false;
    }
  }

  /** The last check is a minute ago or more; a damaged time or one in the future (clock turned back) does not block. */
  private due(): boolean {
    const last = this.deps.store.get<unknown>(FEEDBACK_CHECKED_AT_KEY, null);
    const since = typeof last === 'number' ? this.deps.now() - last : NaN;
    return !(since >= 0 && since < STATUS_CHECK_SPACING_MS);
  }

  private save(reports: KeptReport[]): void {
    this.kept = reports;
    saveReports(this.deps.store, reports);
  }
}
