/**
 * Board sessions (ROADMAP 74): the insights board trades the real STATS_TOKEN once for a
 * short-lived session token it may keep on the device. The token carries only its expiry,
 * signed with HMAC-SHA-256 under the Wrangler secret BOARD_SESSION_KEY:
 * `v1.<expiresAt ms>.<base64url signature>`. Nothing is stored on the server, so rotating
 * the key signs out every device at once; without the key no session token is ever accepted.
 */
import { bearerToken, constantTimeEqual, isAuthorized } from './auth';

export const BOARD_SESSION_DAYS = 7;
export const BOARD_SESSION_MS = BOARD_SESSION_DAYS * 24 * 60 * 60 * 1000;

const VERSION = 'v1';
const TOKEN_PATTERN = /^v1\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

export interface BoardSession {
  token: string;
  /** Milliseconds since the epoch; the token is refused from then on. */
  expiresAt: number;
}

/** The secrets the board routes check. */
export interface BoardSecrets {
  STATS_TOKEN?: string;
  BOARD_SESSION_KEY?: string;
}

const encoder = new TextEncoder();

async function sign(key: string, payload: string): Promise<ArrayBuffer> {
  const hmac = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', hmac, encoder.encode(payload));
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A new session token valid for BOARD_SESSION_MS from `now`. `key` must be set (the caller answers 503 otherwise). */
export async function issueSession(key: string, now: number): Promise<BoardSession> {
  const expiresAt = now + BOARD_SESSION_MS;
  const payload = `${VERSION}.${expiresAt}`;
  return { token: `${payload}.${toBase64Url(await sign(key.trim(), payload))}`, expiresAt };
}

/**
 * Whether `token` was signed under `key` and has not expired. An expiry further ahead than one
 * lifetime is refused too. Always false without a key.
 */
export async function isValidSession(token: string, key: string | undefined, now: number): Promise<boolean> {
  const secret = key?.trim();
  const match = TOKEN_PATTERN.exec(token);
  if (!secret || !match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + BOARD_SESSION_MS) return false;
  // Compared as canonical text, so no second spelling of the same signature bytes passes.
  const expected = toBase64Url(await sign(secret, `${VERSION}.${match[1]}`));
  return constantTimeEqual(encoder.encode(match[2]), encoder.encode(expected));
}

/** The board routes' check: the real STATS_TOKEN or a valid session token as bearer. */
export async function isBoardAuthorized(header: string | null, secrets: BoardSecrets, now: number): Promise<boolean> {
  if (await isAuthorized(header, secrets.STATS_TOKEN)) return true;
  const given = bearerToken(header);
  return given !== null && isValidSession(given, secrets.BOARD_SESSION_KEY, now);
}
