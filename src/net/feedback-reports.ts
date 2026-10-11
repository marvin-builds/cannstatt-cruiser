/**
 * The reports sent from this device (ROADMAP 70): what was sent (text,
 * details, the log lines actually sent and the report's secret key), the id
 * the worker returned, the UTC day, and the last known status, reply and done
 * version with what the player last saw of them (the red dot). Kept under
 * FEEDBACK_SENT_KEY, at most MAX_STATUS_ITEMS, newest kept. The session id is
 * never kept. Pure helpers over the Store; feedback-status.ts asks the worker.
 */
import type { Store } from '../core/storage';
import {
  FEEDBACK_KEY_PATTERN,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type FeedbackBody,
  type FeedbackStatus,
  MAX_STATUS_ITEMS,
} from './feedback-types';
import { VERSION_PATTERN } from './telemetry-types';

export const FEEDBACK_SENT_KEY = 'feedbackSent';
/** ROADMAP 57's ids and notes: reports without a key cannot be asked about any more. */
const LEGACY_KEYS = ['feedbackIds', 'feedbackNotes'];

/** A report's status as the game shows it: the worker's, or 'removed' when the worker left it out (deleted or pruned). */
export type ReportStatus = FeedbackStatus | 'removed';

/** What was sent, as kept on the device. */
export interface SentReport {
  id: number;
  key: string;
  /** YYYY-MM-DD (UTC) of sending. */
  day: string;
  kind: FeedbackBody['kind'];
  text: string;
  version: string;
  platform: FeedbackBody['platform'];
  input: FeedbackBody['input'];
  orientation: FeedbackBody['orientation'];
  viewWidth: number;
  log: string[];
}

export interface KeptReport extends SentReport {
  status: ReportStatus;
  reply: string | null;
  doneVersion: string | null;
  /** reportSignature of what the player last saw in "Mein Feedback". */
  seen: string;
}

/** A row id as the worker hands them out. */
export const isFeedbackId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** A new secret key: 16 random bytes as 32 lowercase hex characters. */
export function newFeedbackKey(fill: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  return Array.from(fill(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The report as kept: the sent body without the session id, with the worker's id and the day. */
export function sentReport(body: FeedbackBody, id: number, day: string): SentReport {
  const { kind, text, version, platform, input, orientation, viewWidth, log, key } = body;
  return { id, key, day, kind, text, version, platform, input, orientation, viewWidth, log: [...log] };
}

/** What the red dot compares: status, reply and done version. */
export const reportSignature = (r: Pick<KeptReport, 'status' | 'reply' | 'doneVersion'>): string => JSON.stringify([r.status, r.reply, r.doneVersion]);

/** Status, reply or done version changed since the player last opened "Mein Feedback". */
export const reportChanged = (r: KeptReport): boolean => reportSignature(r) !== r.seen;

const isString = (v: unknown): v is string => typeof v === 'string';
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';

function isKept(v: unknown): v is KeptReport {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isFeedbackId(r.id) &&
    isString(r.key) &&
    FEEDBACK_KEY_PATTERN.test(r.key) &&
    isString(r.day) &&
    FEEDBACK_KINDS.includes(r.kind as FeedbackBody['kind']) &&
    isString(r.text) &&
    isString(r.version) &&
    isString(r.platform) &&
    isString(r.input) &&
    isString(r.orientation) &&
    typeof r.viewWidth === 'number' &&
    Array.isArray(r.log) &&
    r.log.every(isString) &&
    (r.status === 'removed' || FEEDBACK_STATUSES.includes(r.status as FeedbackStatus)) &&
    isNullableString(r.reply) &&
    (r.doneVersion === null || (isString(r.doneVersion) && VERSION_PATTERN.test(r.doneVersion))) &&
    isString(r.seen)
  );
}

/** The kept reports, oldest first; a damaged value counts as none, damaged reports are left out. */
export function loadReports(store: Store): KeptReport[] {
  const raw = store.get<unknown>(FEEDBACK_SENT_KEY, []);
  return Array.isArray(raw) ? raw.filter(isKept).slice(-MAX_STATUS_ITEMS) : [];
}

export function saveReports(store: Store, reports: readonly KeptReport[]): void {
  store.set(FEEDBACK_SENT_KEY, reports.slice(-MAX_STATUS_ITEMS));
}

/** Keeps a just sent report (open, nothing new to see), once per id, dropping the oldest beyond MAX_STATUS_ITEMS. */
export function keepReport(store: Store, sent: SentReport): KeptReport[] {
  const fresh = { status: 'open', reply: null, doneVersion: null } as const;
  const kept: KeptReport = { ...sent, ...fresh, seen: reportSignature(fresh) };
  const reports = [...loadReports(store).filter((r) => r.id !== sent.id), kept].slice(-MAX_STATUS_ITEMS);
  saveReports(store, reports);
  return reports;
}

/** Forgets ROADMAP 57's ids and notes, if any are stored. */
export function dropLegacyFeedbackKeys(store: Store): void {
  for (const key of LEGACY_KEYS) if (store.get<unknown>(key, null) !== null) store.set(key, null);
}
