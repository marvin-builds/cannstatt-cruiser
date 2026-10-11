/**
 * Shapes of the triage routes. The `GET /feedback` entries carry the triage
 * fields next to the FeedbackEntry contract; the board's copy in
 * src/insights/triage.ts is checked at type level by test/feedback-triage-types.test.ts.
 */
import type { FEEDBACK_STATUSES } from './feedback-triage-rules';
import type { FeedbackEntry } from './feedback-types';

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackTriage {
  status: FeedbackStatus;
  /** Number of the GitHub issue, or null. */
  issue: number | null;
  /** The operator's short reply for the player, or null. */
  reply: string | null;
}

export type TriagedFeedbackEntry = FeedbackEntry & FeedbackTriage;

export interface TriagedFeedbackList {
  entries: TriagedFeedbackEntry[];
}

/** Body of `POST /feedback/:id/issue`: what the operator chose to publish. */
export interface IssueDraft {
  title: string;
  body: string;
}

/** Body of `PATCH /feedback/:id`: at least one field; a null reply clears it. */
export interface TriagePatch {
  status?: FeedbackStatus;
  reply?: string | null;
}
