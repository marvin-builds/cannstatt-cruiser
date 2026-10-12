/**
 * Shapes of the triage routes. The `GET /feedback` entries carry the triage
 * fields next to the FeedbackEntry contract; the board's copy in
 * src/insights/triage.ts is checked at type level by test/feedback-triage-types.test.ts.
 */
import type { FEEDBACK_STATUSES, ISSUE_STATES } from './feedback-triage-rules';
import type { FeedbackEntry } from './feedback-types';

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type IssueState = (typeof ISSUE_STATES)[number];

export interface FeedbackTriage {
  status: FeedbackStatus;
  /** Number of the GitHub issue, or null. */
  issue: number | null;
  /** The operator's short reply for the player, or null. */
  reply: string | null;
  /** The game version (YYYY-MM-DD.n) the report was done in; only with status done, else null (ROADMAP 70). */
  doneVersion: string | null;
  /** State of the linked issue as last read from GitHub (ROADMAP 82); null without an issue or before the first read. */
  issueState: IssueState | null;
  /** Day (YYYY-MM-DD) the linked issue was closed, or null while it is open or unknown. */
  issueClosedDay: string | null;
}

export type TriagedFeedbackEntry = FeedbackEntry & FeedbackTriage;

export interface TriagedFeedbackList {
  entries: TriagedFeedbackEntry[];
}

/**
 * Body of `POST /feedback/:id/issue`: what the operator chose to publish. The optional developer addition
 * (ROADMAP 75) goes into its own marked section after the body, never into the player's quote.
 */
export interface IssueDraft {
  title: string;
  body: string;
  addition?: string;
  /** The player message stored with the new status Geplant (ROADMAP 83); empty or null stores none. */
  reply?: string | null;
}

/** Body of `POST /feedback/:id/link` (ROADMAP 83): link an existing issue instead of creating one, and set Geplant. */
export interface IssueLink {
  issue: number;
  reply?: string | null;
}

/**
 * Body of `PATCH /feedback/:id`: at least one field; a null reply clears it. doneVersion only with status done;
 * any status patch without it stores null.
 */
export interface TriagePatch {
  status?: FeedbackStatus;
  reply?: string | null;
  doneVersion?: string | null;
}
