import { describe, expect, it } from 'vitest';
import { isBoardAuthorized, isValidSession, issueSession } from '../src/board-session';
import { TESTER_PASS_DAYS } from '../src/feedback-rules';
import { isValidTesterPass, issueTesterPass, TESTER_PASS_MS, TESTER_SCOPE } from '../src/tester-pass';

const KEY = 'c2Vzc2lvbi1rZXktZm9yLXRlc3RzLW9ubHktMDEyMzQ1Njc4OQ==';
const OTHER_KEY = 'b3RoZXIta2V5LWZvci10ZXN0cy1vbmx5LTAxMjM0NTY3ODlhYg==';
const STATS_TOKEN = 'c2VjcmV0LXRva2VuLWZvci10ZXN0cy1vbmx5LTAxMjM0NTY3OA==';
const NOW = Date.parse('2026-10-12T09:15:00Z');

describe('issueTesterPass', () => {
  it(`lasts ${TESTER_PASS_DAYS} days, names its scope and carries only its expiry and a signature`, async () => {
    expect(TESTER_PASS_MS).toBe(TESTER_PASS_DAYS * 24 * 3600_000);
    const pass = await issueTesterPass(KEY, NOW);
    expect(pass.scope).toBe(TESTER_SCOPE);
    expect(TESTER_SCOPE).toBe('tester');
    expect(pass.expiresAt).toBe(NOW + TESTER_PASS_MS);
    expect(pass.pass).toMatch(/^tester\.v1\.\d+\.[A-Za-z0-9_-]{43}$/);
    expect(pass.pass.split('.')[2]).toBe(String(pass.expiresAt));
    expect(pass.pass).not.toContain(KEY);
  });
});

describe('isValidTesterPass', () => {
  it('accepts its own pass until the expiry, then rejects it', async () => {
    const { pass, expiresAt } = await issueTesterPass(KEY, NOW);
    expect(await isValidTesterPass(pass, KEY, NOW)).toBe(true);
    expect(await isValidTesterPass(pass, KEY, expiresAt - 1)).toBe(true);
    expect(await isValidTesterPass(pass, KEY, expiresAt)).toBe(false);
  });

  it('rejects a pass whose expiry or signature was changed', async () => {
    const { pass, expiresAt } = await issueTesterPass(KEY, NOW);
    const signature = pass.split('.')[3];
    const later = `tester.v1.${expiresAt + 1}.${signature}`;
    const flipped = pass.slice(0, -1) + (pass.endsWith('A') ? 'B' : 'A');
    for (const bad of [later, flipped, `${pass}A`, pass.slice(0, -1), `tester.v2.${expiresAt}.${signature}`, '', 'tester.v1..', STATS_TOKEN]) {
      expect(await isValidTesterPass(bad, KEY, NOW), bad).toBe(false);
    }
  });

  it('rejects an expiry further ahead than one lifetime, another key and a missing key', async () => {
    expect(await isValidTesterPass((await issueTesterPass(KEY, NOW + TESTER_PASS_MS)).pass, KEY, NOW)).toBe(false);
    const { pass } = await issueTesterPass(KEY, NOW);
    expect(await isValidTesterPass((await issueTesterPass(OTHER_KEY, NOW)).pass, KEY, NOW)).toBe(false);
    for (const key of [undefined, '', ' \n']) expect(await isValidTesterPass(pass, key, NOW)).toBe(false);
    expect(await isValidTesterPass(pass, `${KEY}\n`, NOW)).toBe(true);
  });
});

describe('scope separation', () => {
  it('a board session token is no tester pass, even with a tester prefix put in front', async () => {
    const { token } = await issueSession(KEY, NOW);
    expect(await isValidTesterPass(token, KEY, NOW)).toBe(false);
    expect(await isValidTesterPass(`tester.${token}`, KEY, NOW)).toBe(false);
  });

  it('a tester pass is no board session and opens no board route', async () => {
    const { pass } = await issueTesterPass(KEY, NOW);
    const stripped = pass.replace(/^tester\./, '');
    expect(await isValidSession(pass, KEY, NOW)).toBe(false);
    expect(await isValidSession(stripped, KEY, NOW)).toBe(false);
    for (const bearer of [pass, stripped]) {
      expect(await isBoardAuthorized(`Bearer ${bearer}`, { STATS_TOKEN, BOARD_SESSION_KEY: KEY }, NOW)).toBe(false);
    }
  });
});
