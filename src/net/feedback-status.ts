/**
 * What happened to the player's own feedback (ROADMAP 57). No account and no
 * device id: the game keeps the ids the worker returned for its sent reports
 * on this device (FEEDBACK_IDS_KEY, at most MAX_STATUS_IDS, newest kept) and,
 * at most once per UTC day, asks `GET /feedback/status?ids=...` for their
 * status and the operator's short reply. The last answer and the notes already
 * shown persist (FEEDBACK_NOTES_KEY), so a note shows once per report and
 * status, also when the player rides on before seeing it. The gate is the
 * feedback sender's (feedbackBaseUrl): only the live host in a production
 * build, or an injected test URL; tests use a fake fetch.
 */
import type { Store } from '../core/storage';
import { type FetchLike, REQUEST_TIMEOUT_MS } from './api';
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
  type FeedbackStatusEntry,
  MAX_REPLY_CHARS,
  MAX_STATUS_IDS,
} from './feedback-types';
import { jsonBody, timedFetch } from './timed-fetch';

export const FEEDBACK_IDS_KEY = 'feedbackIds';
export const FEEDBACK_NOTES_KEY = 'feedbackNotes';

/** The statuses a player hears about: planned, done, not planned. */
const NOTE_STATUSES: readonly FeedbackStatus[] = ['todo', 'done', 'rejected'];

/** A row id as the worker hands them out. */
export const isFeedbackId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** The kept ids, oldest first; a damaged value counts as none (or keeps its valid ids). */
export function loadFeedbackIds(store: Store): number[] {
  const raw = store.get<unknown>(FEEDBACK_IDS_KEY, []);
  return Array.isArray(raw) ? raw.filter(isFeedbackId).slice(-MAX_STATUS_IDS) : [];
}

/** Keeps the id of a sent report (once), dropping the oldest beyond MAX_STATUS_IDS. */
export function rememberFeedbackId(store: Store, id: number): void {
  store.set(FEEDBACK_IDS_KEY, [...loadFeedbackIds(store).filter((kept) => kept !== id), id].slice(-MAX_STATUS_IDS));
}

/** What persists between page loads. */
interface NotesState {
  /** UTC day (YYYY-MM-DD) of the last check, or null. */
  checked: string | null;
  /** The last answer, for the kept ids. */
  entries: FeedbackStatusEntry[];
  /** `id:status` of every note already shown. */
  seen: string[];
}

const noteKey = (e: FeedbackStatusEntry) => `${e.id}:${e.status}`;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A valid answer row for one of `asked`, the reply capped; else null. */
function parseEntry(v: unknown, asked: readonly number[]): FeedbackStatusEntry | null {
  if (typeof v !== 'object' || v === null) return null;
  const { id, status, reply } = v as Record<string, unknown>;
  if (!isFeedbackId(id) || !asked.includes(id) || !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) return null;
  if (reply !== null && typeof reply !== 'string') return null;
  return { id, status: status as FeedbackStatus, reply: reply === null ? null : reply.slice(0, MAX_REPLY_CHARS) };
}

/** The valid rows of a `GET /feedback/status` answer, or null when it is not one. */
function parseAnswer(body: unknown, asked: readonly number[]): FeedbackStatusEntry[] | null {
  const entries = (body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return null;
  return entries.map((e) => parseEntry(e, asked)).filter((e): e is FeedbackStatusEntry => e !== null);
}

function loadState(store: Store): NotesState {
  const raw = store.get<Partial<NotesState> | null>(FEEDBACK_NOTES_KEY, null);
  const ids = loadFeedbackIds(store);
  return {
    checked: typeof raw?.checked === 'string' ? raw.checked : null,
    entries: Array.isArray(raw?.entries) ? (parseAnswer({ entries: raw.entries }, ids) ?? []) : [],
    seen: Array.isArray(raw?.seen) ? raw.seen.filter((s): s is string => typeof s === 'string') : [],
  };
}

export interface FeedbackStatusDeps {
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
export type FeedbackStatusLike = Pick<FeedbackStatusCheck, 'checkIfDue' | 'note' | 'dismiss'>;

export class FeedbackStatusCheck {
  private state: NotesState;
  private asking = false;

  constructor(private readonly deps: FeedbackStatusDeps) {
    this.state = loadState(deps.store);
  }

  /** The newest report with a status the player has not heard about yet, or null. */
  get note(): FeedbackStatusEntry | null {
    for (let i = this.state.entries.length - 1; i >= 0; i--) {
      const entry = this.state.entries[i]!;
      if (NOTE_STATUSES.includes(entry.status) && !this.state.seen.includes(noteKey(entry))) return entry;
    }
    return null;
  }

  /** The note was shown and closed: never again for this report and status. */
  dismiss(): void {
    const note = this.note;
    if (!note) return;
    const kept = new Set(this.state.entries.map((e) => e.id));
    // Only notes of reports still kept are remembered, so the list stays short.
    const seen = this.state.seen.filter((key) => kept.has(Number(key.split(':')[0])));
    this.save({ ...this.state, seen: [...seen, noteKey(note)] });
  }

  /**
   * Asks for the kept reports' status unless it already did today (a failed try counts too),
   * nothing is kept, the device is offline or there is no endpoint. Never throws.
   */
  async checkIfDue(): Promise<void> {
    const { baseUrl, store, now } = this.deps;
    const ids = loadFeedbackIds(store);
    const today = utcDay(now());
    if (this.asking || baseUrl === null || ids.length === 0 || this.state.checked === today || !this.deps.online()) return;
    this.asking = true;
    this.save({ ...this.state, checked: today });
    try {
      const response = await timedFetch(this.deps.fetch, `${baseUrl}/feedback/status?ids=${ids.join(',')}`, { method: 'GET' }, this.deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
      const entries = response?.status === 200 ? parseAnswer(await jsonBody(response), ids) : null;
      if (entries === null) return;
      // Ids the worker no longer knows were deleted or pruned: nothing will ever change for them.
      const known = new Set(entries.map((e) => e.id));
      store.set(FEEDBACK_IDS_KEY, ids.filter((id) => known.has(id)));
      this.save({ ...this.state, entries: ids.flatMap((id) => entries.find((e) => e.id === id) ?? []) });
    } finally {
      this.asking = false;
    }
  }

  private save(state: NotesState): void {
    this.state = state;
    this.deps.store.set(FEEDBACK_NOTES_KEY, state);
  }
}
