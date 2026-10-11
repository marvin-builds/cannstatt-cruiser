import { describe, expect, it } from 'vitest';
import type { Store } from '../core/storage';
import type { FetchLike } from '../net/api';
import { createSession } from './client';
import { BoardAuth, SESSION_STORE_KEY } from './session';

const REAL = 'echtes-geheimes-token-123';
const NOW = Date.parse('2026-10-11T14:37:21Z');
const DAY = 24 * 3600_000;
const SESSION = { token: 'v1.1760799441000.c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWduYXR1cmUtMDEy', expiresAt: NOW + 7 * DAY };

/** A store like localStorage: JSON strings per key, so tests can read exactly what was written. */
function fakeStore() {
  const values = new Map<string, string>();
  const store: Store = {
    get: <T>(key: string, fallback: T): T => (values.has(key) ? (JSON.parse(values.get(key)!) as T) : fallback),
    set: (key, value) => void values.set(key, JSON.stringify(value)),
  };
  return { store, values };
}

/** A fake worker: POST /board/session answers with SESSION for the real token, 401 otherwise, or `status`. */
function fakeWorker(status = 200) {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    const ok = init?.headers?.Authorization === `Bearer ${REAL}`;
    const answer = ok ? status : 401;
    return { ok: answer === 200, status: answer, json: async () => (answer === 200 ? SESSION : { error: 'x' }) };
  };
  const create = (token: string) => createSession(fetchFn, { base: 'http://x', token });
  return { calls, create };
}

const clock = (start = NOW) => {
  const c = { now: start, read: () => c.now };
  return c;
};

describe('BoardAuth with "Angemeldet bleiben"', () => {
  it('trades the real token for a session and keeps only the session token and its expiry', async () => {
    const { store, values } = fakeStore();
    const worker = fakeWorker();
    const auth = new BoardAuth(store, clock().read);
    expect(await auth.signIn(` ${REAL}\n`, true, worker.create)).toEqual({ ok: true, note: null });
    expect(worker.calls).toEqual([{ url: 'http://x/board/session', auth: `Bearer ${REAL}` }]);
    expect(auth.bearer()).toBe(SESSION.token);
    expect(auth.remembered).toBe(true);
    expect([...values.keys()]).toEqual([SESSION_STORE_KEY]);
    expect(JSON.parse(values.get(SESSION_STORE_KEY)!)).toEqual(SESSION);
    expect([...values.values()].join()).not.toContain(REAL);
  });

  it('uses the stored session after a reload without asking again', async () => {
    const { store } = fakeStore();
    await new BoardAuth(store, clock().read).signIn(REAL, true, fakeWorker().create);
    const reloaded = new BoardAuth(store, clock(NOW + DAY).read);
    expect(reloaded.bearer()).toBe(SESSION.token);
    expect(reloaded.remembered).toBe(true);
  });

  it('drops the session on expiry, also while the board is open', async () => {
    const { store, values } = fakeStore();
    await new BoardAuth(store, clock().read).signIn(REAL, true, fakeWorker().create);
    expect(new BoardAuth(store, clock(SESSION.expiresAt).read).bearer()).toBeNull();
    expect(store.get(SESSION_STORE_KEY, null)).toBeNull();

    await new BoardAuth(store, clock().read).signIn(REAL, true, fakeWorker().create);
    const time = clock();
    const open = new BoardAuth(store, time.read);
    expect(open.bearer()).toBe(SESSION.token);
    time.now = SESSION.expiresAt + 1;
    expect(open.bearer()).toBeNull();
    expect(open.remembered).toBe(false);
    expect(JSON.parse(values.get(SESSION_STORE_KEY)!)).toBeNull();
  });

  it('drops the session on a 401 and says the sign-in ended', async () => {
    const { store } = fakeStore();
    const auth = new BoardAuth(store, clock().read);
    await auth.signIn(REAL, true, fakeWorker().create);
    expect(auth.rejected()).toBe('session-ended');
    expect(auth.bearer()).toBeNull();
    expect(new BoardAuth(store, clock().read).bearer()).toBeNull();
  });

  it('drops the session with Abmelden', async () => {
    const { store } = fakeStore();
    const auth = new BoardAuth(store, clock().read);
    await auth.signIn(REAL, true, fakeWorker().create);
    auth.signOut();
    expect(auth.bearer()).toBeNull();
    expect(auth.remembered).toBe(false);
    expect(new BoardAuth(store, clock().read).bearer()).toBeNull();
  });

  it('a wrong token stores nothing and fails with auth', async () => {
    const { store, values } = fakeStore();
    const auth = new BoardAuth(store, clock().read);
    expect(await auth.signIn('falsch', true, fakeWorker().create)).toEqual({ ok: false, error: 'auth' });
    expect(auth.bearer()).toBeNull();
    expect(values.size).toBe(0);
  });

  it('falls back to the real token in memory only when the worker cannot make a session', async () => {
    const { store, values } = fakeStore();
    const auth = new BoardAuth(store, clock().read);
    const result = await auth.signIn(REAL, true, fakeWorker(503).create);
    expect(result.ok && result.note).toMatch(/Angemeldet bleiben/);
    expect(auth.bearer()).toBe(REAL);
    expect(auth.remembered).toBe(false);
    expect(values.size).toBe(0);
  });

  it('ignores a malformed stored value', () => {
    for (const bad of ['x', { token: 5, expiresAt: NOW + DAY }, { token: SESSION.token }, { token: '', expiresAt: NOW + DAY }, null]) {
      const { store } = fakeStore();
      store.set(SESSION_STORE_KEY, bad);
      expect(new BoardAuth(store, clock().read).bearer(), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('BoardAuth without "Angemeldet bleiben"', () => {
  it('keeps the real token in memory only, stores nothing and never asks the worker for a session', async () => {
    const { store, values } = fakeStore();
    const worker = fakeWorker();
    const auth = new BoardAuth(store, clock().read);
    expect(await auth.signIn(REAL, false, worker.create)).toEqual({ ok: true, note: null });
    expect(auth.bearer()).toBe(REAL);
    expect(auth.remembered).toBe(false);
    expect(worker.calls).toEqual([]);
    expect(values.size).toBe(0);
    expect(new BoardAuth(store, clock().read).bearer()).toBeNull();
  });

  it('a 401 says the token is wrong', async () => {
    const auth = new BoardAuth(fakeStore().store, clock().read);
    await auth.signIn(REAL, false, fakeWorker().create);
    expect(auth.rejected()).toBe('token-wrong');
    expect(auth.bearer()).toBeNull();
  });
});
