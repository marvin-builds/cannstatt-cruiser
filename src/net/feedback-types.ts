/**
 * Contract for player feedback (ROADMAP 50): the `POST /feedback` body the
 * game sends and the token-protected `GET /feedback` answer the insights board
 * reads. Mirrored by server/src/feedback-rules.ts; feedback-types.test.ts keeps
 * both equal. No name, no device id, no session id stored: the session id only
 * rate-limits on the server. Day only, no exact time.
 */
import type { InputKind, Orientation, Platform } from './telemetry-types';

export const FEEDBACK_KINDS = ['bug', 'idea'] as const;
/** Text length in characters after trimming. */
export const MIN_FEEDBACK_TEXT = 3;
export const MAX_FEEDBACK_TEXT = 500;
/** The optional error log: at most this many lines of at most this many characters. */
export const MAX_LOG_LINES = 20;
export const MAX_LOG_LINE_CHARS = 200;
export const MAX_FEEDBACK_BYTES = 16384;
/** The game's view width range in view px (core/config.ts VIEW_W..VIEW_MAX_W). */
export const MIN_VIEW_WIDTH = 320;
export const MAX_VIEW_WIDTH = 427;
export const FEEDBACK_PER_SESSION_PER_DAY = 3;
/** Feedback is deleted after this many days (USER: 1 year). */
export const FEEDBACK_RETENTION_DAYS = 365;
/** `GET /feedback` returns at most this many entries, newest first. */
export const FEEDBACK_LIST_LIMIT = 100;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Sent once per press on "Senden". */
export interface FeedbackBody {
  /** The telemetry session id of this page load (rate limit only, never stored with the text). */
  session: string;
  kind: FeedbackKind;
  text: string;
  version: string;
  platform: Platform;
  input: InputKind;
  orientation: Orientation;
  /** Whole view px, MIN_VIEW_WIDTH..MAX_VIEW_WIDTH. */
  viewWidth: number;
  /** Error log lines, empty unless the player ticked "Fehlerprotokoll mitsenden" on a bug report. */
  log: string[];
}

export interface FeedbackEntry {
  id: number;
  /** YYYY-MM-DD (UTC). */
  day: string;
  kind: FeedbackKind;
  text: string;
  version: string;
  platform: Platform;
  input: InputKind;
  orientation: Orientation;
  viewWidth: number;
  log: string[];
}

/** The `GET /feedback` answer. */
export interface FeedbackList {
  entries: FeedbackEntry[];
}
