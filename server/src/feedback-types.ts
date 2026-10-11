/**
 * Shapes of the `POST /feedback` body and the `GET /feedback` answer. Copy of the
 * types in the game's src/net/feedback-types.ts (the worker builds on its own);
 * test/feedback-types.test.ts checks both are equal at type level.
 */
import type { FEEDBACK_KINDS } from './feedback-rules';
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
