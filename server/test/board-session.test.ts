import { describe, expect, it } from 'vitest';
import { BOARD_SESSION_MS, isBoardAuthorized, isValidSession, issueSession } from '../src/board-session';

const KEY = 'c2Vzc2lvbi1rZXktZm9yLXRlc3RzLW9ubHktMDEyMzQ1Njc4OQ==';
const OTHER_KEY = 'b3RoZXIta2V5LWZvci10ZXN0cy1vbmx5LTAxMjM0NTY3ODlhYg==';
const STATS_TOKEN = 'c2VjcmV0LXRva2VuLWZvci10ZXN0cy1vbmx5LTAxMjM0NTY3OA==';
const NOW = Date.parse('2026-10-11T14:37:21Z');

describe('issueSession', () => {
  it('lasts 7 days and carries only its expiry and a signature', async () => {
    expect(BOARD_SESSION_MS).toBe(7 * 24 * 3600_000);
    const session = await issueSession(KEY, NOW);
    expect(session.expiresAt).toBe(NOW + BOARD_SESSION_MS);
    expect(session.token).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]{43}$/);
    expect(session.token.split('.')[1]).toBe(String(session.expiresAt));
    expect(session.token).not.toContain(KEY);
  });

  it('signs the same expiry the same way and different expiries differently', async () => {
    expect((await issueSession(KEY, NOW)).token).toBe((await issueSession(KEY, NOW)).token);
    expect((await issueSession(KEY, NOW)).token).not.toBe((await issueSession(KEY, NOW + 1)).token);
  });
});

describe('isValidSession', () => {
  it('accepts its own token until the expiry', async () => {
    const { token, expiresAt } = await issueSession(KEY, NOW);
    expect(await isValidSession(token, KEY, NOW)).toBe(true);
    expect(await isValidSession(token, KEY, expiresAt - 1)).toBe(true);
  });

  it('rejects it from the expiry on', async () => {
    const { token, expiresAt } = await issueSession(KEY, NOW);
    expect(await isValidSession(token, KEY, expiresAt)).toBe(false);
    expect(await isValidSession(token, KEY, expiresAt + 3600_000)).toBe(false);
  });

  it('rejects a token whose expiry or signature was changed', async () => {
    const { token, expiresAt } = await issueSession(KEY, NOW);
    const [version, , signature] = token.split('.');
    const later = `${version}.${expiresAt + BOARD_SESSION_MS}.${signature}`;
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    for (const bad of [later, flipped, `${token}A`, token.slice(0, -1), `v2.${expiresAt}.${signature}`, `${version}.${expiresAt}.`, '', 'v1..', STATS_TOKEN]) {
      expect(await isValidSession(bad, KEY, NOW), bad).toBe(false);
    }
  });

  it('rejects an expiry further ahead than one lifetime, even when signed', async () => {
    const { token } = await issueSession(KEY, NOW + BOARD_SESSION_MS);
    expect(await isValidSession(token, KEY, NOW)).toBe(false);
  });

  it('rejects tokens signed with another key (rotation signs every device out)', async () => {
    const { token } = await issueSession(OTHER_KEY, NOW);
    expect(await isValidSession(token, KEY, NOW)).toBe(false);
  });

  it('never accepts a token without a key', async () => {
    const { token } = await issueSession(KEY, NOW);
    expect(await isValidSession(token, undefined, NOW)).toBe(false);
    expect(await isValidSession(token, '', NOW)).toBe(false);
    expect(await isValidSession(token, '  \n', NOW)).toBe(false);
  });

  it('ignores whitespace around the key', async () => {
    const { token } = await issueSession(KEY, NOW);
    expect(await isValidSession(token, `${KEY}\n`, NOW)).toBe(true);
  });
});

describe('isBoardAuthorized', () => {
  const env = { STATS_TOKEN, BOARD_SESSION_KEY: KEY };

  it('accepts the stats token or a valid session token as bearer', async () => {
    const { token } = await issueSession(KEY, NOW);
    expect(await isBoardAuthorized(`Bearer ${STATS_TOKEN}`, env, NOW)).toBe(true);
    expect(await isBoardAuthorized(`Bearer ${token}`, env, NOW)).toBe(true);
  });

  it('rejects an expired session, a missing header and a session without the key', async () => {
    const { token, expiresAt } = await issueSession(KEY, NOW);
    expect(await isBoardAuthorized(`Bearer ${token}`, env, expiresAt)).toBe(false);
    expect(await isBoardAuthorized(null, env, NOW)).toBe(false);
    expect(await isBoardAuthorized(token, env, NOW)).toBe(false);
    expect(await isBoardAuthorized(`Bearer ${token}`, { STATS_TOKEN }, NOW)).toBe(false);
  });

  it('trims the configured stats token', async () => {
    expect(await isBoardAuthorized(`Bearer ${STATS_TOKEN}`, { STATS_TOKEN: ` ${STATS_TOKEN}\n` }, NOW)).toBe(true);
  });
});
