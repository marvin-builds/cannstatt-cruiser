/**
 * Tester passes (ROADMAP 75): the board fetches one for a device the owner marked as a test device, and
 * the game sends it with `POST /feedback`; a valid pass lifts FEEDBACK_PER_SESSION_PER_DAY. Signed under
 * BOARD_SESSION_KEY like a board session but with its own prefix (`tester.v1.<expiresAt>.<signature>`), so a
 * pass never opens a board route and a board session token is never a pass. Never stored on the server.
 */
import { TESTER_PASS_DAYS } from './feedback-rules';
import { issueToken, isValidToken, type TokenKind } from './signed-token';

export const TESTER_PASS_MS = TESTER_PASS_DAYS * 24 * 60 * 60 * 1000;
export const TESTER_SCOPE = 'tester';

const TESTER: TokenKind = { prefix: `${TESTER_SCOPE}.v1`, lifetimeMs: TESTER_PASS_MS };

/** The `POST /board/tester-pass` answer. */
export interface TesterPass {
  pass: string;
  scope: typeof TESTER_SCOPE;
  /** Milliseconds since the epoch; the pass is ignored from then on. */
  expiresAt: number;
}

/** A new pass valid for TESTER_PASS_MS from `now`. `key` must be set (the caller answers 503 otherwise). */
export async function issueTesterPass(key: string, now: number): Promise<TesterPass> {
  const { token, expiresAt } = await issueToken(TESTER, key, now);
  return { pass: token, scope: TESTER_SCOPE, expiresAt };
}

/** Whether `pass` is an unexpired tester pass signed under `key`; always false without a key. */
export function isValidTesterPass(pass: string, key: string | undefined, now: number): Promise<boolean> {
  return isValidToken(TESTER, pass, key, now);
}
