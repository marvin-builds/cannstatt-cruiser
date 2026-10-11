/**
 * Reads GET /stats and GET /feedback of the highscore worker with the admin token. The token is
 * passed in per call and never stored. Every failure maps to an error code,
 * nothing throws; `fetch` is passed in so tests never reach the live worker.
 */
import { type FetchLike, REQUEST_TIMEOUT_MS, SCORES_URL } from '../net/api';
import { FEEDBACK_KINDS, type FeedbackEntry, type FeedbackList } from '../net/feedback-types';
import { type CountEntry, INPUTS, type InsightsStats, ORIENTATIONS, PLATFORMS, STATS_RANGES, type StatsRange } from '../net/telemetry-types';

export type StatsError = 'auth' | 'offline' | 'server';
export type StatsResult = { ok: true; stats: InsightsStats } | { ok: false; error: StatsError };

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/**
 * The worker base URL: `?api=http(s)://...` overrides it only when the page
 * itself runs on localhost (local worker testing); everywhere else the live worker.
 */
export function apiBase(location: { hostname: string; search: string }): string {
  if (!LOCAL_HOSTS.includes(location.hostname)) return SCORES_URL;
  const override = new URLSearchParams(location.search).get('api');
  if (!override || !/^https?:\/\/[^\s]+$/.test(override)) return SCORES_URL;
  return override.replace(/\/+$/, '');
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isEntry = (v: unknown): v is CountEntry => isRecord(v) && typeof v.key === 'string' && isCount(v.count);
const isEntries = (v: unknown): v is CountEntry[] => Array.isArray(v) && v.every(isEntry);
const SPLITS = ['input', 'orientation', 'platform', 'kid', 'version', 'country', 'region', 'city'] as const;

function isDay(v: unknown): boolean {
  return isRecord(v) && typeof v.day === 'string' && isCount(v.sessions) && isCount(v.runs) && isCount(v.entries);
}

function isTop(v: unknown): boolean {
  return isRecord(v) && typeof v.name === 'string' && isCount(v.score) && typeof v.date === 'string';
}

/** Checks the shape the board reads; anything else counts as a server error. */
export function isInsightsStats(v: unknown): v is InsightsStats {
  if (!isRecord(v) || !STATS_RANGES.includes(v.days as StatsRange) || typeof v.generatedAt !== 'string') return false;
  const { perDay, sessions, runs, split, topScores } = v;
  if (!Array.isArray(perDay) || !perDay.every(isDay)) return false;
  if (!isRecord(sessions) || !isCount(sessions.total) || !isCount(sessions.medianSeconds) || !isCount(sessions.avgSeconds)) return false;
  if (!isRecord(runs) || !isCount(runs.total) || !isCount(runs.perSession)) return false;
  if (!isEntries(runs.seconds) || !isEntries(runs.distance) || !isEntries(runs.score)) return false;
  if (!isRecord(split) || !SPLITS.every((k) => isEntries(split[k]))) return false;
  return Array.isArray(topScores) && topScores.every(isTop);
}

export interface StatsRequest {
  base: string;
  token: string;
  days: StatsRange;
  timeoutMs?: number;
}

export function fetchStats(fetchFn: FetchLike, request: StatsRequest): Promise<StatsResult> {
  const url = `${request.base}/stats?days=${request.days}`;
  return authorizedGet(fetchFn, url, request, isInsightsStats).then((r) => (r.ok ? { ok: true, stats: r.body } : r));
}

const isIn = <T extends string>(values: readonly T[], v: unknown): v is T => values.includes(v as T);

function isFeedbackEntry(v: unknown): v is FeedbackEntry {
  if (!isRecord(v) || !Number.isInteger(v.id) || typeof v.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return false;
  if (!isIn(FEEDBACK_KINDS, v.kind) || typeof v.text !== 'string' || typeof v.version !== 'string') return false;
  if (!isIn(PLATFORMS, v.platform) || !isIn(INPUTS, v.input) || !isIn(ORIENTATIONS, v.orientation) || !isCount(v.viewWidth)) return false;
  return Array.isArray(v.log) && v.log.every((line) => typeof line === 'string');
}

/** Checks the GET /feedback answer; anything else counts as a server error. */
export function isFeedbackList(v: unknown): v is FeedbackList {
  return isRecord(v) && Array.isArray(v.entries) && v.entries.every(isFeedbackEntry);
}

export type FeedbackResult = { ok: true; entries: FeedbackEntry[] } | { ok: false; error: StatsError };

export interface FeedbackRequest {
  base: string;
  token: string;
  timeoutMs?: number;
}

/** GET /feedback; an older worker without the route answers 404, which maps to 'server'. */
export function fetchFeedback(fetchFn: FetchLike, request: FeedbackRequest): Promise<FeedbackResult> {
  return authorizedGet(fetchFn, `${request.base}/feedback`, request, isFeedbackList).then((r) => (r.ok ? { ok: true, entries: r.body.entries } : r));
}

type GetResult<T> = { ok: true; body: T } | { ok: false; error: StatsError };

/** A GET with the bearer token, given up after the timeout; never throws. */
async function authorizedGet<T>(
  fetchFn: FetchLike,
  url: string,
  request: { token: string; timeoutMs?: number },
  check: (v: unknown) => v is T,
): Promise<GetResult<T>> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<GetResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ ok: false, error: 'offline' });
    }, request.timeoutMs ?? REQUEST_TIMEOUT_MS);
  });
  const call = async (): Promise<GetResult<T>> => {
    const init = { headers: { Authorization: `Bearer ${request.token}` }, ...(controller ? { signal: controller.signal } : {}) };
    const response = await fetchFn(url, init);
    if (response.status === 401) return { ok: false, error: 'auth' };
    if (response.status !== 200) return { ok: false, error: 'server' };
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON: rejected below.
    }
    return check(body) ? { ok: true, body } : { ok: false, error: 'server' };
  };
  try {
    return await Promise.race([call(), timeout]);
  } catch {
    return { ok: false, error: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
