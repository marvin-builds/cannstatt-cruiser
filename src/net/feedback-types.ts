/**
 * Contract for player feedback (ROADMAP 50): the `POST /feedback` body the
 * game sends and its answer (the new id), the token-protected `GET /feedback`
 * answer the insights board reads, and the `POST /feedback/status` query and
 * answer the game uses for its own reports (ROADMAP 57, 70). Mirrored by
 * server/src/feedback-rules.ts; feedback-types.test.ts keeps both equal. No
 * name, no device id, no session id stored: the session id only rate-limits on
 * the server. Each report carries a random secret key made on the device; the
 * worker keeps only its SHA-256, and the status query needs id and key. Day
 * only, no exact time.
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
/** Store key (core Store, so `cannstatt-cruiser:testerPass`) of the tester pass the board issues to a test device. */
export const TESTER_PASS_KEY = 'testerPass';
/** A tester pass is at most this long; a longer one is a bad request. */
export const MAX_TESTER_PASS_CHARS = 512;
/** A tester pass is valid this many days after the board issued it. */
export const TESTER_PASS_DAYS = 180;
/** Feedback is deleted after this many days (USER: 1 year). */
export const FEEDBACK_RETENTION_DAYS = 365;
/** `GET /feedback` returns at most this many entries, newest first. */
export const FEEDBACK_LIST_LIMIT = 100;

/** `POST /feedback/status` takes at most this many reports; the game keeps as many. */
export const MAX_STATUS_ITEMS = 20;
/** A report's secret key: 128 random bits as lowercase hex. */
export const FEEDBACK_KEY_PATTERN = /^[0-9a-f]{32}$/;
/** Set on the insights board (ROADMAP 56); mirror of server/src/feedback-triage-rules.ts. */
export const FEEDBACK_STATUSES = ['open', 'todo', 'done', 'rejected'] as const;
/** The operator's reply is at most this long (server/src/feedback-triage-rules.ts). */
export const MAX_REPLY_CHARS = 140;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

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
  /** The report's secret key (FEEDBACK_KEY_PATTERN); the worker stores only its SHA-256. */
  key: string;
  /**
   * The owner's tester pass (ROADMAP 75), sent only from a marked test device that holds one
   * under TESTER_PASS_KEY. A valid pass lifts FEEDBACK_PER_SESSION_PER_DAY; omitted otherwise.
   */
  testerPass?: string;
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

/** The `POST /feedback` answer: the new report's id, kept on the device for the status check. */
export interface FeedbackSent {
  ok: true;
  id: number;
}

/** One report asked about by `POST /feedback/status`. */
export interface FeedbackStatusItem {
  id: number;
  key: string;
}

/** The `POST /feedback/status` body: 1 to MAX_STATUS_ITEMS items. */
export interface FeedbackStatusQuery {
  items: FeedbackStatusItem[];
}

/** One row of the `POST /feedback/status` answer: only status, the operator's short reply and the done version, never the text. */
export interface FeedbackStatusEntry {
  id: number;
  status: FeedbackStatus;
  /** The operator's short reply for the player, or null. */
  reply: string | null;
  /** The game version (YYYY-MM-DD.n) a done report shipped in, or null. */
  doneVersion: string | null;
}

/** The `POST /feedback/status` answer; unknown, deleted or non-matching reports are left out. */
export interface FeedbackStatusList {
  entries: FeedbackStatusEntry[];
}
