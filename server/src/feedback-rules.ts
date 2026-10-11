/**
 * Limits for player feedback (`POST /feedback`, `GET /feedback`, `POST /feedback/status`).
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
/** Mirror of src/net/feedback-types.ts: the longest tester pass, and how long one is valid. */
export const MAX_TESTER_PASS_CHARS = 512;
export const TESTER_PASS_DAYS = 180;
export const FEEDBACK_RETENTION_DAYS = 365;
export const FEEDBACK_LIST_LIMIT = 100;
/** `POST /feedback/status` takes 1 to this many {id, key} items (the game keeps as many reports, ROADMAP 70). */
export const MAX_STATUS_ITEMS = 20;
/** A report's secret key: 128 random bits as lowercase hex, made by the game; the worker stores only its SHA-256. */
export const FEEDBACK_KEY_PATTERN = /^[0-9a-f]{32}$/;
/** A `POST /feedback/status` body is never larger than this (MAX_STATUS_ITEMS items of about 60 characters). */
export const MAX_STATUS_BYTES = 2048;
