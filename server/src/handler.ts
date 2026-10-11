/**
 * HTTP API: GET /top, POST /score, POST /event, POST /board/session, GET /stats, POST /feedback, GET /feedback,
 * POST /feedback/status (the game asks for its own reports by id and secret key, no token), the feedback triage
 * routes (POST /feedback/:id/issue, PATCH and DELETE /feedback/:id), OPTIONS preflight.
 * Uses the request body, the Origin and Authorization headers and, for
 * session events, Cloudflare's coarse location (request.cf); never the client IP.
 */
import { utcDay, utcHour } from './aggregate';
import { isAuthorized } from './auth';
import { isBoardAuthorized, issueSession } from './board-session';
import { corsHeaders, isAllowedOrigin } from './cors';
import { claimDailySlot, condenseAndPruneOnceADay, saveEvent } from './event-store';
import { parseEvent } from './event-parse';
import { MAX_EVENT_BYTES, STATS_RANGES, STATS_TESTERS_PARAM } from './events';
import { parseFeedback } from './feedback-parse';
import { MAX_FEEDBACK_BYTES, MAX_STATUS_BYTES } from './feedback-rules';
import type { FeedbackSent, FeedbackStatusList } from './feedback-types';
import { listFeedback, pruneFeedbackOnceADay, saveFeedback } from './feedback-store';
import { parseStatusItems } from './feedback-status-parse';
import { parseFeedbackId, parseIssueDraft, parseTriagePatch } from './feedback-triage-parse';
import { ISSUE_LABEL, MAX_TRIAGE_BYTES } from './feedback-triage-rules';
import { deleteFeedback, feedbackForIssue, feedbackStatuses, storeIssue, updateTriage } from './feedback-triage-store';
import { createIssue, type GitHubFetch } from './github';
import { locationOf } from './location';
import { rankRows } from './ranking';
import { isRateLimited } from './rate-limit';
import { loadStats } from './stats';
import { deviceRow, recentSubmissions, saveBestRun, sha256Hex, topRows } from './store';
import { isDeviceId, parseSubmission } from './submission';

export interface Env {
  DB: D1Database;
  /** Bearer token for GET /stats and the feedback routes of the board (Wrangler secret). Without it they always answer 401. */
  STATS_TOKEN?: string;
  /** HMAC key for board session tokens (Wrangler secret, ROADMAP 74). Without it POST /board/session answers 503 and no session token is accepted. */
  BOARD_SESSION_KEY?: string;
  /** Fine-grained GitHub token, Issues read/write on ISSUE_REPO only (Wrangler secret). Without it no issue can be made. */
  GITHUB_TOKEN?: string;
}

/** Larger bodies are rejected unread beyond this many characters. */
const MAX_BODY = 2048;
const TOP_CACHE = 'public, max-age=30';
/** GET /top?device= answers per device, so shared caches must not keep it. */
const OWN_TOP_CACHE = 'private, max-age=30';
/** sendBeacon sends text/plain; fetch may send JSON. Same for feedback. */
const BODY_TYPES = ['text/plain', 'application/json'];

type Failure =
  | 'bad-request' | 'unauthorized' | 'forbidden' | 'name' | 'implausible' | 'rate' | 'not-found' | 'exists' | 'github' | 'github-token-missing'
  | 'session-key-missing';
const STATUS: Record<Failure, number> = {
  'bad-request': 400, unauthorized: 401, forbidden: 403, name: 422, implausible: 422, rate: 429, 'not-found': 404, exists: 409,
  github: 502, 'github-token-missing': 503, 'session-key-missing': 503,
};
/** `/feedback/<id>` and `/feedback/<id>/issue`; the id is checked by parseFeedbackId. */
const TRIAGE_PATH = /^\/feedback\/([^/]+)(\/issue)?$/;

const jsonResponse = (cors: Record<string, string>, body: unknown, status: number, cache = 'no-store', extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });

/**
 * Answers the request; an unexpected error becomes a 500 with CORS headers, so the browser can read it.
 * `github` reaches the GitHub API (injected, so tests never do).
 */
export async function handleRequest(request: Request, env: Env, now: number, github: GitHubFetch = fetch): Promise<Response> {
  try {
    return await route(request, env, now, github);
  } catch (error) {
    console.error('request failed', error);
    return jsonResponse(corsHeaders(request.headers.get('Origin')), { error: 'server' }, 500);
  }
}

async function route(request: Request, env: Env, now: number, github: GitHubFetch): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin);
  const json = (body: unknown, status: number, cache = 'no-store', extra: Record<string, string> = {}) => jsonResponse(cors, body, status, cache, extra);
  const fail = (error: Failure, extra: Record<string, unknown> = {}) =>
    json({ ok: false, error, ...extra }, STATUS[error], 'no-store', error === 'unauthorized' ? { 'WWW-Authenticate': 'Bearer' } : {});

  const { pathname, searchParams } = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method === 'GET' && pathname === '/top') {
    if (!searchParams.has('device')) return json({ entries: rankRows(await topRows(env.DB), null).entries }, 200, TOP_CACHE);
    const rawDevice = searchParams.get('device');
    if (!isDeviceId(rawDevice)) return fail('bad-request');
    const own = await deviceRow(env.DB, await sha256Hex(rawDevice));
    const { entries, rank } = rankRows(await topRows(env.DB), own?.id ?? null);
    return json({ entries, own: own && { rank, score: own.score } }, 200, OWN_TOP_CACHE);
  }
  // The token is checked before anything else, so an unauthorized call never reaches the database.
  // Board routes take the real token or a board session token; only the real token opens a session.
  const authorized = () => isBoardAuthorized(request.headers.get('Authorization'), env, now);
  if (pathname === '/board/session') {
    if (request.method !== 'POST') return fail('not-found');
    if (!(await isAuthorized(request.headers.get('Authorization'), env.STATS_TOKEN))) return fail('unauthorized');
    if (!env.BOARD_SESSION_KEY?.trim()) return fail('session-key-missing');
    return json(await issueSession(env.BOARD_SESSION_KEY, now), 200);
  }
  if (request.method === 'GET' && pathname === '/stats') {
    if (!(await authorized())) return fail('unauthorized');
    const values = searchParams.getAll('days');
    const days = STATS_RANGES.find((range) => values.length === 1 && String(range) === values[0]);
    if (days === undefined) return fail('bad-request');
    // Only exactly one `testers=1` includes test devices; anything else leaves them out.
    const testers = searchParams.getAll(STATS_TESTERS_PARAM).join() === '1';
    return json(await loadStats(env.DB, days, now, testers), 200);
  }
  if (request.method === 'POST' && pathname === '/event') {
    if (!isAllowedOrigin(origin)) return fail('forbidden');
    const event = parseEvent((await readLimitedText(request, MAX_EVENT_BYTES)) ?? '');
    if (event === null) return fail('bad-request');
    const day = utcDay(now);
    // Over the daily cap the event is dropped silently: the game cannot do anything about it.
    if (await claimDailySlot(env.DB, day)) {
      await saveEvent(env.DB, event, { day, hour: utcHour(now) }, locationOf(request.cf));
      // Housekeeping after the event is stored: a failure is logged and retried on a later event.
      await condenseAndPruneOnceADay(env.DB, now).catch((error: unknown) => console.error('condense and prune failed', error));
    }
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === 'GET' && pathname === '/feedback') {
    if (!(await authorized())) return fail('unauthorized');
    return json({ entries: await listFeedback(env.DB) }, 200);
  }
  if (request.method === 'POST' && pathname === '/feedback') {
    if (!isAllowedOrigin(origin)) return fail('forbidden');
    const feedback = parseFeedback((await readLimitedText(request, MAX_FEEDBACK_BYTES)) ?? '');
    if (feedback === null) return fail('bad-request');
    // The session id only rate-limits, as a hash in the day's counter table; it is never stored with the text.
    // Of the secret key only its hash is stored, so the database alone cannot answer a status query (ROADMAP 70).
    const hashes = { session: await sha256Hex(feedback.session), key: feedback.key === undefined ? null : await sha256Hex(feedback.key) };
    const id = await saveFeedback(env.DB, feedback, hashes, utcDay(now));
    if (id === null) return fail('rate');
    // Housekeeping after the feedback is stored: a failure is logged and retried on a later request.
    await pruneFeedbackOnceADay(env.DB, now).catch((error: unknown) => console.error('feedback prune failed', error));
    // The id (with the game's key) lets the game ask for its own report's status later (ROADMAP 57, 70).
    return json({ ok: true, id } satisfies FeedbackSent, 201);
  }
  // Before the triage routes, whose path would take "status" for a row id. Only POST (keys never in URLs); only reads,
  // and only status, reply and done version of rows whose key matches, never the text.
  if (pathname === '/feedback/status') {
    if (request.method !== 'POST') return fail('not-found');
    if (!isAllowedOrigin(origin)) return fail('forbidden');
    const items = parseStatusItems((await readLimitedText(request, MAX_STATUS_BYTES)) ?? '');
    if (items === null) return fail('bad-request');
    const hashed = await Promise.all(items.map(async ({ id, key }) => ({ id, keyHash: await sha256Hex(key) })));
    return json({ entries: await feedbackStatuses(env.DB, hashed) } satisfies FeedbackStatusList, 200);
  }
  const triage = TRIAGE_PATH.exec(pathname);
  if (triage) {
    if (!(await authorized())) return fail('unauthorized');
    const id = parseFeedbackId(triage[1]!);
    const action = `${request.method} ${triage[2] ? 'issue' : 'row'}`;
    if (!['POST issue', 'PATCH row', 'DELETE row'].includes(action)) return fail('not-found');
    if (id === null) return fail('bad-request');
    if (action === 'DELETE row') return (await deleteFeedback(env.DB, id)) ? new Response(null, { status: 204, headers: cors }) : fail('not-found');
    const text = (await readLimitedText(request, MAX_TRIAGE_BYTES)) ?? '';
    if (action === 'PATCH row') {
      const patch = parseTriagePatch(text);
      if (patch === null) return fail('bad-request');
      const updated = await updateTriage(env.DB, id, patch);
      return updated ? json({ ok: true, ...updated }, 200) : fail('not-found');
    }
    const draft = parseIssueDraft(text);
    if (draft === null) return fail('bad-request');
    const githubToken = env.GITHUB_TOKEN?.trim();
    if (!githubToken) return fail('github-token-missing');
    const row = await feedbackForIssue(env.DB, id);
    if (!row) return fail('not-found');
    if (row.issue !== null) return fail('exists', { issue: row.issue });
    const created = await createIssue(github, githubToken, { ...draft, labels: [ISSUE_LABEL, row.kind] });
    if (!created.ok) return fail('github', { status: created.status });
    await storeIssue(env.DB, id, created.number);
    return json({ ok: true, issue: created.number }, 201);
  }
  if (request.method !== 'POST' || pathname !== '/score') return fail('not-found');

  const parsed = parseSubmission(await readJson(request));
  if (!parsed.ok) return fail(parsed.error);
  const device = await sha256Hex(parsed.value.device);
  if (isRateLimited(await recentSubmissions(env.DB, device, now), now)) return fail('rate');
  const written = await saveBestRun(env.DB, parsed.value, device, now);
  const own = await deviceRow(env.DB, device);
  const { entries, rank } = rankRows(await topRows(env.DB), own?.id ?? null);
  // Without a row the run was pruned at once (outside the kept rows): its score is the best known.
  return json({ ok: true, stored: written && own !== null, rank, best: own?.score ?? parsed.value.score, entries }, 200);
}

/** The parsed body, or undefined when it is too large or not JSON. */
async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The body as text, or null for another content type than BODY_TYPES or more than `maxBytes`. */
async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!BODY_TYPES.includes(type)) return null;
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) return null;
  const bytes = await request.arrayBuffer();
  return bytes.byteLength > maxBytes ? null : new TextDecoder().decode(bytes);
}
