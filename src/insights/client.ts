/**
 * Reads GET /stats and GET /feedback of the highscore worker with the admin token and sends the
 * feedback triage (issue, status and reply, delete; ROADMAP 56). The token is passed in per call and never stored. Every failure maps to an error code,
 * nothing throws; `fetch` is passed in so tests never reach the live worker.
 */
import { type FetchLike, REQUEST_TIMEOUT_MS, SCORES_URL } from '../net/api';
import { FEEDBACK_KINDS, type FeedbackEntry } from '../net/feedback-types';
import { type CountEntry, INPUTS, type InsightsStats, ORIENTATIONS, PLATFORMS, STATS_RANGES, STATS_TESTERS_PARAM, type StatsRange } from '../net/telemetry-types';
import type { TriageError } from './triage';
import {
  FEEDBACK_STATUSES, type FeedbackTriage, type IssueDraft, type TriagedFeedbackEntry, type TriagePatch,
} from './triage-types';

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
  return isRecord(v) && typeof v.day === 'string' && isCount(v.sessions) && isCount(v.runs) && isCount(v.entries) && isCount(v.newPlayers) && isCount(v.returningVisits);
}

function isTop(v: unknown): boolean {
  return isRecord(v) && typeof v.name === 'string' && isCount(v.score) && typeof v.date === 'string';
}

/** Checks the shape the board reads; anything else counts as a server error. */
export function isInsightsStats(v: unknown): v is InsightsStats {
  if (!isRecord(v) || !STATS_RANGES.includes(v.days as StatsRange) || typeof v.generatedAt !== 'string') return false;
  const { perDay, sessions, visits, runs, split, topScores } = v;
  if (!Array.isArray(perDay) || !perDay.every(isDay)) return false;
  if (!isRecord(visits) || !isCount(visits.new) || !isCount(visits.returning) || !isCount(visits.unknown)) return false;
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
  /** Include the owner's test devices ('inkl. Testgeräte'). */
  testers?: boolean;
  timeoutMs?: number;
}

export async function fetchStats(fetchFn: FetchLike, request: StatsRequest): Promise<StatsResult> {
  const url = `${request.base}/stats?days=${request.days}${request.testers ? `&${STATS_TESTERS_PARAM}=1` : ''}`;
  const r = await authorizedRequest(fetchFn, url, request);
  if (!r.ok) return r;
  return r.status === 200 && isInsightsStats(r.body) ? { ok: true, stats: r.body } : { ok: false, error: 'server' };
}

const isIn = <T extends string>(values: readonly T[], v: unknown): v is T => values.includes(v as T);

function isFeedbackEntry(v: unknown): v is FeedbackEntry {
  if (!isRecord(v) || !Number.isInteger(v.id) || typeof v.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return false;
  if (!isIn(FEEDBACK_KINDS, v.kind) || typeof v.text !== 'string' || typeof v.version !== 'string') return false;
  if (!isIn(PLATFORMS, v.platform) || !isIn(INPUTS, v.input) || !isIn(ORIENTATIONS, v.orientation) || !isCount(v.viewWidth)) return false;
  return Array.isArray(v.log) && v.log.every((line) => typeof line === 'string');
}

const isIssue = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

/** The triage fields; each may be missing (a worker before ROADMAP 56), but never of the wrong type. */
function hasValidTriage(v: unknown): boolean {
  return isRecord(v) && (v.status === undefined || isIn(FEEDBACK_STATUSES, v.status)) &&
    (v.issue === undefined || v.issue === null || isIssue(v.issue)) &&
    (v.reply === undefined || v.reply === null || typeof v.reply === 'string');
}

const withTriage = (v: FeedbackEntry & Partial<FeedbackTriage>): TriagedFeedbackEntry => ({ ...v, status: v.status ?? 'open', issue: v.issue ?? null, reply: v.reply ?? null });

/** Checks the GET /feedback answer (the triage fields optional); anything else counts as a server error. */
export function isFeedbackList(v: unknown): v is { entries: (FeedbackEntry & Partial<FeedbackTriage>)[] } {
  return isRecord(v) && Array.isArray(v.entries) && v.entries.every((e) => isFeedbackEntry(e) && hasValidTriage(e));
}

export type FeedbackResult = { ok: true; entries: TriagedFeedbackEntry[] } | { ok: false; error: StatsError };

export interface FeedbackRequest {
  base: string;
  token: string;
  timeoutMs?: number;
}

/** GET /feedback; an older worker without the route answers 404, which maps to 'server'. Entries without triage count as open. */
export async function fetchFeedback(fetchFn: FetchLike, request: FeedbackRequest): Promise<FeedbackResult> {
  const r = await authorizedRequest(fetchFn, `${request.base}/feedback`, request);
  if (!r.ok) return r;
  if (r.status !== 200 || !isFeedbackList(r.body)) return { ok: false, error: 'server' };
  return { ok: true, entries: r.body.entries.map(withTriage) };
}

export type TriageResult<T> = ({ ok: true } & T) | ({ ok: false } & TriageError);

export interface TriageRequest extends FeedbackRequest {
  id: number;
}

/** The worker's error answer of a triage route as a TriageError. */
function triageFailure(status: number, body: unknown): TriageError {
  const answer = isRecord(body) ? body : {};
  if (status === 401) return { error: 'auth' };
  if (status === 400) return { error: 'bad-request' };
  if (status === 404) return { error: 'not-found' };
  if (status === 409 && isIssue(answer.issue)) return { error: 'exists', issue: answer.issue };
  if (status === 502 && typeof answer.status === 'number') return { error: 'github', status: answer.status };
  if (status === 503 && answer.error === 'github-token-missing') return { error: 'github-token-missing' };
  return { error: 'server' };
}

/** POST /feedback/:id/issue: the worker creates the GitHub issue and sets the row to todo. */
export async function createIssue(fetchFn: FetchLike, request: TriageRequest & { draft: IssueDraft }): Promise<TriageResult<{ issue: number }>> {
  const r = await authorizedRequest(fetchFn, `${request.base}/feedback/${request.id}/issue`, request, 'POST', request.draft);
  if (!r.ok) return r;
  if (r.status !== 201) return { ok: false, ...triageFailure(r.status, r.body) };
  const issue = isRecord(r.body) ? r.body.issue : undefined;
  return isIssue(issue) ? { ok: true, issue } : { ok: false, error: 'server' };
}

const isTriage = (v: unknown): v is FeedbackTriage =>
  isRecord(v) && isIn(FEEDBACK_STATUSES, v.status) && (v.issue === null || isIssue(v.issue)) && (v.reply === null || typeof v.reply === 'string');

/** PATCH /feedback/:id with status and/or reply; the row's triage fields afterwards. */
export async function patchFeedback(fetchFn: FetchLike, request: TriageRequest & { patch: TriagePatch }): Promise<TriageResult<{ triage: FeedbackTriage }>> {
  const r = await authorizedRequest(fetchFn, `${request.base}/feedback/${request.id}`, request, 'PATCH', request.patch);
  if (!r.ok) return r;
  if (r.status !== 200) return { ok: false, ...triageFailure(r.status, r.body) };
  if (!isTriage(r.body)) return { ok: false, error: 'server' };
  const { status, issue, reply } = r.body;
  return { ok: true, triage: { status, issue, reply } };
}

/** DELETE /feedback/:id. */
export async function deleteFeedback(fetchFn: FetchLike, request: TriageRequest): Promise<TriageResult<object>> {
  const r = await authorizedRequest(fetchFn, `${request.base}/feedback/${request.id}`, request, 'DELETE');
  if (!r.ok) return r;
  return r.status === 204 ? { ok: true } : { ok: false, ...triageFailure(r.status, r.body) };
}

type Answer = { ok: true; status: number; body: unknown } | { ok: false; error: 'auth' | 'offline' };

/**
 * A request with the bearer token (and a JSON body if given), given up after the timeout; never throws.
 * 401 is 'auth'; any other status comes back with its body (null when there is none or it is not JSON).
 */
async function authorizedRequest(
  fetchFn: FetchLike,
  url: string,
  request: { token: string; timeoutMs?: number },
  method?: 'POST' | 'PATCH' | 'DELETE',
  json?: unknown,
): Promise<Answer> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Answer>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ ok: false, error: 'offline' });
    }, request.timeoutMs ?? REQUEST_TIMEOUT_MS);
  });
  const call = async (): Promise<Answer> => {
    const headers: Record<string, string> = { Authorization: `Bearer ${request.token}` };
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const init = {
      ...(method ? { method } : {}),
      headers,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    };
    const response = await fetchFn(url, init);
    if (response.status === 401) return { ok: false, error: 'auth' };
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // No body or not JSON: the caller decides by the status.
    }
    return { ok: true, status: response.status, body };
  };
  try {
    return await Promise.race([call(), timeout]);
  } catch {
    return { ok: false, error: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
