/**
 * The board's copy of the worker's feedback triage contract (ROADMAP 56,
 * server/src/feedback-triage-rules.ts and feedback-triage-types.ts): checked
 * by triage.test.ts (values) and server/test/feedback-triage-types.test.ts (types).
 */
import type { FeedbackEntry } from '../net/feedback-types';

export const FEEDBACK_STATUSES = ['open', 'todo', 'done', 'rejected'] as const;
export const ISSUE_REPO = 'marvinmai/cannstatt-cruiser';
export const MIN_ISSUE_TITLE = 3;
export const MAX_ISSUE_TITLE = 120;
export const MAX_ISSUE_BODY = 8000;
export const MAX_REPLY_CHARS = 140;

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

export interface IssueDraft {
  title: string;
  body: string;
}

export interface TriagePatch {
  status?: FeedbackStatus;
  reply?: string | null;
}
