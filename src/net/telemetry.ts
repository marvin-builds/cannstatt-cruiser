/**
 * Anonymous play statistics (ROADMAP 46): builds the `POST /event` bodies of
 * telemetry-types.ts from what the game knows and sends them fire and forget
 * (no queue, no retry, every error swallowed). Values are coarse buckets; the
 * session id is random per page load and kept in memory only. Nothing is sent
 * unless the gate (`telemetryBaseUrl`) gives a base URL and the player has not
 * opted out (store key `statsOptOut`, read at every send). Network access
 * (`fetch`, the beacon) is injected, so unit tests never reach the worker.
 */
import type { Store } from '../core/storage';
import { PX_PER_METRE } from '../ui/layout';
import { type FetchLike, SCORES_URL } from './api';
import type { RunStats } from './payload';
import {
  DISTANCE_STEP_M,
  type EndEvent,
  MAX_DISTANCE_M,
  MAX_END_SECONDS,
  MAX_RUN_SECONDS,
  type Platform,
  RUN_SECONDS_STEP,
  type RunEvent,
  SCORE_BUCKETS,
  type ScoreBucket,
  type SessionEvent,
  type TelemetryEvent,
  TEST_DEVICE_KEY,
} from './telemetry-types';

/** The only host whose players send statistics to the live worker (GitHub Pages). */
export const PRODUCTION_HOST = 'marvin-builds.github.io';

const OPT_OUT_KEY = 'statsOptOut';

/** Sending is on unless the player switched it off: only a stored `true` opts out. */
export function loadStatsOptOut(store: Store): boolean {
  return store.get<unknown>(OPT_OUT_KEY, false) === true;
}

export function saveStatsOptOut(store: Store, optOut: boolean): void {
  store.set(OPT_OUT_KEY, optOut);
}

/** The owner's test device (ROADMAP 55): only a stored `true`, which only the insights board writes; the game only reads it. */
export function loadTestDevice(store: Store): boolean {
  return store.get<unknown>(TEST_DEVICE_KEY, false) === true;
}

const floorTo = (value: number, step: number, max: number) => Math.min(max, Math.max(0, Math.floor(value / step) * step));

/** The largest SCORE_BUCKETS lower bound at or below `score`. */
export function scoreBucket(score: number): ScoreBucket {
  let bucket: ScoreBucket = SCORE_BUCKETS[0];
  for (const b of SCORE_BUCKETS) if (score >= b) bucket = b;
  return bucket;
}

/** Game px -> metres, floored to DISTANCE_STEP_M, capped at MAX_DISTANCE_M. */
export function distanceBucket(px: number): number {
  return floorTo(px / PX_PER_METRE, DISTANCE_STEP_M, MAX_DISTANCE_M);
}

/** Run seconds floored to RUN_SECONDS_STEP, capped at MAX_RUN_SECONDS. */
export function runSecondsBucket(seconds: number): number {
  return floorTo(seconds, RUN_SECONDS_STEP, MAX_RUN_SECONDS);
}

/** Whole seconds of active play, capped at MAX_END_SECONDS. */
export function endSeconds(seconds: number): number {
  return floorTo(seconds, 1, MAX_END_SECONDS);
}

/** What the game knows about this page load when the title first shows. */
export interface SessionInfo {
  touch: boolean;
  platform: Platform;
  kid: boolean;
}

/** ROADMAP 55: the test device marker and new vs. returning (undefined = unknown). */
export interface SessionFlags {
  tester: boolean;
  returning?: boolean;
}

/** `tester` only when true, `returning` only when known (both optional in the contract). */
export function sessionEvent(session: string, version: string, info: SessionInfo, flags: SessionFlags = { tester: false }): SessionEvent {
  return {
    kind: 'session',
    session,
    version,
    input: info.touch ? 'touch' : 'keys',
    platform: info.platform,
    kid: info.kid,
    ...(flags.tester ? { tester: true } : {}),
    ...(flags.returning === undefined ? {} : { returning: flags.returning }),
  };
}

export function runEvent(session: string, run: RunStats, kid: boolean): RunEvent {
  return {
    kind: 'run',
    session,
    seconds: runSecondsBucket(run.seconds),
    score: scoreBucket(run.score),
    distance: distanceBucket(run.distance),
    kid,
  };
}

export function endEvent(session: string, seconds: number): EndEvent {
  return { kind: 'end', session, seconds: endSeconds(seconds) };
}

/** 32 lowercase hex chars from `fill` (crypto.getRandomValues). */
export function newSessionId(fill: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  return Array.from(fill(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TelemetryEnv {
  /** location.hostname */
  hostname: string;
  /** import.meta.env.DEV */
  dev: boolean;
  /** navigator.globalPrivacyControl === true */
  gpc: boolean;
  /** An explicit endpoint for manual or play tests (any host); never a fallback to the live worker. */
  baseUrl?: string | null;
}

/** Where to send, or null when nothing may be sent (GPC always wins). */
export function telemetryBaseUrl(env: TelemetryEnv): string | null {
  if (env.gpc) return null;
  if (env.baseUrl !== undefined && env.baseUrl !== null) return env.baseUrl ? env.baseUrl.replace(/\/+$/, '') : null;
  return env.hostname === PRODUCTION_HOST && !env.dev ? SCORES_URL : null;
}

/** navigator.sendBeacon with the body as text/plain; true when queued. */
export type BeaconLike = (url: string, body: string) => boolean;

export interface TelemetryDeps {
  /** From telemetryBaseUrl; null sends nothing. */
  baseUrl: string | null;
  fetch: FetchLike;
  /** Used for `end` (the page is going away); null falls back to fetch. */
  beacon: BeaconLike | null;
  /** Holds the opt-out (read at every send) and the test device marker (read when the session goes out); the session id is never stored. */
  store: Store;
  /** BUILD_VERSION */
  version: string;
  /** The session id (tests); default a fresh newSessionId(). */
  session?: string;
  /** Game data was stored before this page load (returning.ts); undefined = unknown, left out of the session. */
  returning?: boolean;
}

/** The part the ui calls. */
export type TelemetryLike = Pick<Telemetry, 'session' | 'run' | 'played' | 'end'>;

/**
 * One page load's statistics: `session` once (when the title first shows),
 * `run` per game over, `end` with the active play seconds so far whenever the
 * page is hidden (the server keeps the largest). A session held back by the
 * opt-out goes out first with the next run or end once the player opts back
 * in; with the gate closed nothing is ever sent.
 */
export class Telemetry {
  private readonly id: string;
  private sessionSent = false;
  /** The first title's info, kept until the session may be sent. */
  private pending: SessionInfo | null = null;
  private activeSeconds = 0;

  constructor(private readonly deps: TelemetryDeps) {
    this.id = deps.session ?? newSessionId();
  }

  session(info: SessionInfo): void {
    this.pending ??= info;
    this.sendSession();
  }

  run(run: RunStats, kid: boolean): void {
    if (this.sendSession()) this.post(runEvent(this.id, run, kid));
  }

  /** Adds seconds of active play (the ui calls it every tick while a run is playing). */
  played(seconds: number): void {
    this.activeSeconds += seconds;
  }

  end(): void {
    if (!this.sendSession()) return;
    const body = JSON.stringify(endEvent(this.id, this.activeSeconds));
    try {
      if (this.deps.beacon?.(this.url, body)) return;
    } catch {
      // Fall through to fetch.
    }
    this.postBody(body);
  }

  /** Sends the held-back session if allowed now; true when the session is out and sending is allowed. */
  private sendSession(): boolean {
    if (!this.allowed()) return false;
    if (!this.sessionSent && this.pending) {
      this.sessionSent = true;
      const flags = { tester: loadTestDevice(this.deps.store), returning: this.deps.returning };
      this.post(sessionEvent(this.id, this.deps.version, this.pending, flags));
    }
    return this.sessionSent;
  }

  private get url(): string {
    return `${this.deps.baseUrl}/event`;
  }

  private allowed(): boolean {
    return this.deps.baseUrl !== null && !loadStatsOptOut(this.deps.store);
  }

  private post(event: TelemetryEvent): void {
    this.postBody(JSON.stringify(event));
  }

  /** text/plain keeps it a simple CORS request (no preflight); the answer is ignored. */
  private postBody(body: string): void {
    try {
      void this.deps.fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {});
    } catch {
      // Statistics never disturb the game.
    }
  }
}
