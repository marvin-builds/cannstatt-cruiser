/**
 * Limits for player feedback (`POST /feedback`, `GET /feedback`).
 * Mirror of src/net/feedback-types.ts in the game; a game test keeps both equal.
 */

export const FEEDBACK_KINDS = ['bug', 'idea'] as const;
export const MIN_FEEDBACK_TEXT = 3;
export const MAX_FEEDBACK_TEXT = 500;
export const MAX_LOG_LINES = 20;
export const MAX_LOG_LINE_CHARS = 200;
export const MAX_FEEDBACK_BYTES = 16384;
export const MIN_VIEW_WIDTH = 320;
export const MAX_VIEW_WIDTH = 427;
export const FEEDBACK_PER_SESSION_PER_DAY = 3;
export const FEEDBACK_RETENTION_DAYS = 365;
export const FEEDBACK_LIST_LIMIT = 100;
/** `GET /feedback/status` answers for at most this many ids (the game keeps as many). */
export const MAX_STATUS_IDS = 10;
