/**
 * Shapes of the `POST /feedback` body and answer, the `GET /feedback` and `GET /feedback/status` answers. Copy of the
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
}

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

/** One row of `GET /feedback/status`: only what the player may learn about their own report. */
export interface FeedbackStatusEntry {
  id: number;
  status: FeedbackStatus;
  /** The operator's short reply for the player, or null. */
  reply: string | null;
}

/** The `GET /feedback/status` answer; unknown ids are left out. */
export interface FeedbackStatusList {
  entries: FeedbackStatusEntry[];
}
