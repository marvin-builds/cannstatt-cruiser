/**
 * Stateless signed tokens under BOARD_SESSION_KEY: `<prefix>.<expiresAt ms>.<base64url HMAC-SHA-256>`,
 * where the signature covers `<prefix>.<expiresAt>`. Each kind of token has its own prefix, so a token of
 * one kind never verifies as another (board session `v1`, tester pass `tester.v1`). Nothing is stored on
 * the server: rotating the key invalidates every token of every kind at once.
 */
import { constantTimeEqual } from './auth';

export interface TokenKind {
  /** Letters, digits and dots; part of the signed payload. */
  prefix: string;
  /** How long a token is valid from the moment it is issued. */
  lifetimeMs: number;
}

export interface SignedToken {
  token: string;
  /** Milliseconds since the epoch; the token is refused from then on. */
  expiresAt: number;
}

const encoder = new TextEncoder();

async function sign(key: string, payload: string): Promise<string> {
  const hmac = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', hmac, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const escapeDots = (prefix: string) => prefix.replace(/\./g, '\\.');

/** A new token of `kind`, valid for its lifetime from `now`. `key` must be set (the caller answers 503 otherwise). */
export async function issueToken(kind: TokenKind, key: string, now: number): Promise<SignedToken> {
  const expiresAt = now + kind.lifetimeMs;
  const payload = `${kind.prefix}.${expiresAt}`;
  return { token: `${payload}.${await sign(key.trim(), payload)}`, expiresAt };
}

/**
 * Whether `token` is a token of `kind` signed under `key` that has not expired. An expiry further ahead
 * than one lifetime is refused too. Always false without a key.
 */
export async function isValidToken(kind: TokenKind, token: string, key: string | undefined, now: number): Promise<boolean> {
  const secret = key?.trim();
  const match = new RegExp(`^${escapeDots(kind.prefix)}\\.(\\d{1,15})\\.([A-Za-z0-9_-]{43})$`).exec(token);
  if (!secret || !match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + kind.lifetimeMs) return false;
  // Compared as canonical text, so no second spelling of the same signature bytes passes.
  const expected = await sign(secret, `${kind.prefix}.${match[1]}`);
  return constantTimeEqual(encoder.encode(match[2]), encoder.encode(expected));
}
