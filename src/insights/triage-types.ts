/**
 * The board's copy of the worker's feedback triage contract (ROADMAP 56,
 * server/src/feedback-triage-rules.ts and feedback-triage-types.ts): checked
 * by triage.test.ts (values) and server/test/feedback-triage-types.test.ts (types).
 */
import type { FeedbackEntry } from '../net/feedback-types';

export const FEEDBACK_STATUSES = ['open', 'todo', 'done', 'rejected'] as const;
/**
 * A linked GitHub issue as the worker last read it (ROADMAP 82): open, closed as done, closed as not planned
 * (GitHub's `not_planned` or `duplicate`), or gone (404, transferred or deleted).
 */
export const ISSUE_STATES = ['open', 'completed', 'notPlanned', 'missing'] as const;
export const ISSUE_REPO = 'marvin-builds/cannstatt-cruiser';
export const MIN_ISSUE_TITLE = 3;
export const MAX_ISSUE_TITLE = 120;
export const MAX_ISSUE_BODY = 8000;
export const MAX_REPLY_CHARS = 140;
/** The optional developer addition of an issue (ROADMAP 75). */
export const MAX_ISSUE_ADDITION = 2000;
/** A game version as the worker checks it (server/src/events.ts VERSION_PATTERN), for 'umgesetzt in Version'. */
export const DONE_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{1,2}$/;

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

/** The worker puts `addition` into its own marked section after the body ('Ergänzung des Entwicklers'). */
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

/** doneVersion only with status done; any status patch without it stores null. */
export interface TriagePatch {
  status?: FeedbackStatus;
  reply?: string | null;
  doneVersion?: string | null;
}
