/**
 * Limits for triaging feedback on the insights board (ROADMAP 56): statuses,
 * the issue draft and the operator's short reply. The board's copy in
 * src/insights/triage.ts is checked against these by a game test.
 */

export const FEEDBACK_STATUSES = ['open', 'todo', 'done', 'rejected'] as const;
/** The public repository that gets the issues (the fine-grained token may write only there). */
export const ISSUE_REPO = 'marvinmai/cannstatt-cruiser';
/** Every feedback issue carries this label plus its kind (`bug` or `idea`). */
export const ISSUE_LABEL = 'feedback';
export const MIN_ISSUE_TITLE = 3;
export const MAX_ISSUE_TITLE = 120;
/** Text (500) plus meta and a full log (20 x 200) fit with room for the operator's notes. */
export const MAX_ISSUE_BODY = 8000;
/** The optional developer addition below the player's text (ROADMAP 75). */
export const MAX_ISSUE_ADDITION = 2000;
/** Short enough for a note on the game's title screen later (ROADMAP 57). */
export const MAX_REPLY_CHARS = 140;
/** A request body of a triage route is never larger than this. */
export const MAX_TRIAGE_BYTES = 32768;
