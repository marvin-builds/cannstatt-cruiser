/**
 * Shapes of the `POST /feedback` body and answer, the `GET /feedback` answer and the `POST /feedback/status` body and answer. Copy of the
 * types in the game's src/net/feedback-types.ts (the worker builds on its own);
 * test/feedback-types.test.ts checks both are equal at type level.
 */
import type { FEEDBACK_KINDS } from './feedback-rules';
import type { FeedbackStatus } from './feedback-triage-types';
import type { InputKind, Orientation, Platform } from './insights-types';

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export interface FeedbackBody {
  session: string;
  kind: FeedbackKind;
  text: string;
  version: string;
  platform: Platform;
  input: InputKind;
  orientation: Orientation;
  viewWidth: number;
  log: string[];
  /** The report's secret key (FEEDBACK_KEY_PATTERN); the worker stores only its SHA-256. */
  key: string;
  /** The owner's tester pass (ROADMAP 75); a valid one lifts FEEDBACK_PER_SESSION_PER_DAY. */
  testerPass?: string;
}

/** A body as the worker accepts it: games before ROADMAP 70 send no key (such a report never gets a status). */
export type ReceivedFeedback = Omit<FeedbackBody, 'key'> & Partial<Pick<FeedbackBody, 'key'>>;

export interface FeedbackEntry {
  id: number;
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

export interface FeedbackList {
  entries: FeedbackEntry[];
}

/** The `POST /feedback` answer: the new row's id, which the game keeps on the device (ROADMAP 57). */
export interface FeedbackSent {
  ok: true;
  id: number;
}

/** One report the game asks about: its id and the secret key it was sent with. */
export interface FeedbackStatusItem {
  id: number;
  key: string;
}

/** The `POST /feedback/status` body: 1 to MAX_STATUS_ITEMS items. */
export interface FeedbackStatusQuery {
  items: FeedbackStatusItem[];
}

/** One row of the `POST /feedback/status` answer: only what the player may learn about their own report. */
export interface FeedbackStatusEntry {
  id: number;
  status: FeedbackStatus;
  /** The operator's short reply for the player, or null. */
  reply: string | null;
  /** The game version the report was done in (YYYY-MM-DD.n), or null. */
  doneVersion: string | null;
}

/** The `POST /feedback/status` answer; unknown, deleted and ids with a non-matching key are left out. */
export interface FeedbackStatusList {
  entries: FeedbackStatusEntry[];
}
