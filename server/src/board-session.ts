/**
 * Board sessions (ROADMAP 74): the insights board trades the real STATS_TOKEN once for a
 * short-lived session token it may keep on the device. The token carries only its expiry,
 * signed with HMAC-SHA-256 under the Wrangler secret BOARD_SESSION_KEY:
 * `v1.<expiresAt ms>.<base64url signature>` (signed-token.ts). Nothing is stored on the server, so rotating
 * the key signs out every device at once; without the key no session token is ever accepted.
 */
import { bearerToken, isAuthorized } from './auth';
import { issueToken, isValidToken, type SignedToken, type TokenKind } from './signed-token';

export const BOARD_SESSION_DAYS = 7;
export const BOARD_SESSION_MS = BOARD_SESSION_DAYS * 24 * 60 * 60 * 1000;

const SESSION: TokenKind = { prefix: 'v1', lifetimeMs: BOARD_SESSION_MS };

export type BoardSession = SignedToken;

/** The secrets the board routes check. */
export interface BoardSecrets {
  STATS_TOKEN?: string;
  BOARD_SESSION_KEY?: string;
}

/** A new session token valid for BOARD_SESSION_MS from `now`. `key` must be set (the caller answers 503 otherwise). */
export function issueSession(key: string, now: number): Promise<BoardSession> {
  return issueToken(SESSION, key, now);
}

/**
 * Whether `token` was signed under `key` and has not expired. An expiry further ahead than one
 * lifetime is refused too. Always false without a key.
 */
export function isValidSession(token: string, key: string | undefined, now: number): Promise<boolean> {
  return isValidToken(SESSION, token, key, now);
}

/** The board routes' check: the real STATS_TOKEN or a valid session token as bearer (never a tester pass). */
export async function isBoardAuthorized(header: string | null, secrets: BoardSecrets, now: number): Promise<boolean> {
  if (await isAuthorized(header, secrets.STATS_TOKEN)) return true;
  const given = bearerToken(header);
  return given !== null && isValidSession(given, secrets.BOARD_SESSION_KEY, now);
}
