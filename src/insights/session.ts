/**
 * Who the board talks to the worker as (ROADMAP 74). Without "Angemeldet bleiben" the real admin
 * token lives only in memory, as before. With it, the real token is traded once for a board session
 * (POST /board/session) and only that session token and its expiry go into storage; the real token is
 * then forgotten. The stored session is used after a reload and dropped on expiry, on a 401 and on
 * "Abmelden". Storage on the Pages origin is shared by every page there, which is why it never holds
 * the real token.
 */
import type { Store } from '../core/storage';
import type { BoardSession, SessionResult, StatsError } from './client';

export const SESSION_STORE_KEY = 'insightsSession';
/** Longer values are no session token of ours. */
const MAX_TOKEN_CHARS = 200;

export type SignInResult = { ok: true; note: string | null } | { ok: false; error: StatsError };
/** Why a 401 locked the board: a kept session ended (expired, key rotated) or a typed token is wrong. */
export type Rejection = 'session-ended' | 'token-wrong';

export const SESSION_UNAVAILABLE = 'Angemeldet bleiben klappt gerade nicht. Nach dem Neuladen fragt das Board wieder nach dem Token.';

type Bearer = { kind: 'token'; token: string } | { kind: 'session'; session: BoardSession } | null;

function isStoredSession(v: unknown): v is BoardSession {
  if (typeof v !== 'object' || v === null) return false;
  const { token, expiresAt } = v as Record<string, unknown>;
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_TOKEN_CHARS && typeof expiresAt === 'number' && Number.isFinite(expiresAt);
}

export class BoardAuth {
  private current: Bearer = null;

  /** Restores a kept session that has not expired yet. */
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {
    const stored = store.get<unknown>(SESSION_STORE_KEY, null);
    if (isStoredSession(stored)) this.current = { kind: 'session', session: stored };
    else this.dropStored();
  }

  /** The bearer for the next request, or null when signed out; an expired session is dropped here. */
  bearer(): string | null {
    if (this.current?.kind === 'session' && this.current.session.expiresAt <= this.now()) this.signOut();
    if (!this.current) return null;
    return this.current.kind === 'token' ? this.current.token : this.current.session.token;
  }

  /** The board runs on a kept session (it then offers "Abmelden"). */
  get remembered(): boolean {
    return this.current?.kind === 'session';
  }

  /**
   * Signs in with the typed admin token. `remember` trades it for a session via `createSession` and
   * keeps only that; when the worker cannot make one (no key, older worker, offline) the real token
   * stays in memory only and `note` says so. A 401 there means the token is wrong.
   */
  async signIn(typed: string, remember: boolean, createSession: (token: string) => Promise<SessionResult>): Promise<SignInResult> {
    const token = typed.trim();
    this.signOut();
    if (!remember) {
      this.current = { kind: 'token', token };
      return { ok: true, note: null };
    }
    const result = await createSession(token);
    if (!result.ok && result.error === 'auth') return { ok: false, error: 'auth' };
    if (!result.ok) {
      this.current = { kind: 'token', token };
      return { ok: true, note: SESSION_UNAVAILABLE };
    }
    this.current = { kind: 'session', session: result.session };
    this.store.set(SESSION_STORE_KEY, result.session);
    return { ok: true, note: null };
  }

  /** The worker answered 401: signs out and tells why. */
  rejected(): Rejection {
    const why = this.remembered ? 'session-ended' : 'token-wrong';
    this.signOut();
    return why;
  }

  /** "Abmelden" / "Sperren": forgets the bearer in memory and the kept session. */
  signOut(): void {
    this.current = null;
    this.dropStored();
  }

  private dropStored(): void {
    if (this.store.get<unknown>(SESSION_STORE_KEY, null) !== null) this.store.set(SESSION_STORE_KEY, null);
  }
}
