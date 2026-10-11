/**
 * HTTP API: GET /top, POST /score, POST /event, GET /stats, OPTIONS preflight.
 * Uses the request body, the Origin and Authorization headers and, for
 * session events, Cloudflare's coarse location (request.cf); never the client IP.
 */
import { utcDay, utcHour } from './aggregate';
import { isAuthorized } from './auth';
import { corsHeaders, isAllowedOrigin } from './cors';
import { claimDailySlot, condenseAndPruneOnceADay, saveEvent } from './event-store';
import { parseEvent } from './event-parse';
import { MAX_EVENT_BYTES, STATS_RANGES } from './events';
import { locationOf } from './location';
import { rankRows } from './ranking';
import { isRateLimited } from './rate-limit';
import { loadStats } from './stats';
import { deviceRow, hashDevice, recentSubmissions, saveBestRun, topRows } from './store';
import { isDeviceId, parseSubmission } from './submission';

export interface Env {
  DB: D1Database;
  /** Bearer token for GET /stats (Wrangler secret). Without it /stats always answers 401. */
  STATS_TOKEN?: string;
}

/** Larger bodies are rejected unread beyond this many characters. */
const MAX_BODY = 2048;
const TOP_CACHE = 'public, max-age=30';
/** GET /top?device= answers per device, so shared caches must not keep it. */
const OWN_TOP_CACHE = 'private, max-age=30';
/** sendBeacon sends text/plain; fetch may send JSON. */
const EVENT_TYPES = ['text/plain', 'application/json'];

type Failure = 'bad-request' | 'unauthorized' | 'forbidden' | 'name' | 'implausible' | 'rate' | 'not-found';
const STATUS: Record<Failure, number> = {
  'bad-request': 400, unauthorized: 401, forbidden: 403, name: 422, implausible: 422, rate: 429, 'not-found': 404,
};

export async function handleRequest(request: Request, env: Env, now: number): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin);
  const json = (body: unknown, status: number, cache = 'no-store', extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });
  const fail = (error: Failure) =>
    json({ ok: false, error }, STATUS[error], 'no-store', error === 'unauthorized' ? { 'WWW-Authenticate': 'Bearer' } : {});

  const { pathname, searchParams } = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method === 'GET' && pathname === '/top') {
    if (!searchParams.has('device')) return json({ entries: rankRows(await topRows(env.DB), null).entries }, 200, TOP_CACHE);
    const rawDevice = searchParams.get('device');
    if (!isDeviceId(rawDevice)) return fail('bad-request');
    const own = await deviceRow(env.DB, await hashDevice(rawDevice));
    const { entries, rank } = rankRows(await topRows(env.DB), own?.id ?? null);
    return json({ entries, own: own && { rank, score: own.score } }, 200, OWN_TOP_CACHE);
  }
  if (request.method === 'GET' && pathname === '/stats') {
    // The token is checked before anything else, so an unauthorized call never reaches the database.
    if (!(await isAuthorized(request.headers.get('Authorization'), env.STATS_TOKEN))) return fail('unauthorized');
    const values = searchParams.getAll('days');
    const days = STATS_RANGES.find((range) => values.length === 1 && String(range) === values[0]);
    if (days === undefined) return fail('bad-request');
    return json(await loadStats(env.DB, days, now), 200);
  }
  if (request.method === 'POST' && pathname === '/event') {
    if (!isAllowedOrigin(origin)) return fail('forbidden');
    const event = parseEvent((await readEventText(request)) ?? '');
    if (event === null) return fail('bad-request');
    const day = utcDay(now);
    // Over the daily cap the event is dropped silently: the game cannot do anything about it.
    if (await claimDailySlot(env.DB, day)) {
      await condenseAndPruneOnceADay(env.DB, now);
      await saveEvent(env.DB, event, { day, hour: utcHour(now) }, locationOf(request.cf));
    }
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST' || pathname !== '/score') return fail('not-found');

  const parsed = parseSubmission(await readJson(request));
  if (!parsed.ok) return fail(parsed.error);
  const device = await hashDevice(parsed.value.device);
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

/** The event body as text, or null for another content type or more than MAX_EVENT_BYTES. */
async function readEventText(request: Request): Promise<string | null> {
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!EVENT_TYPES.includes(type)) return null;
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_EVENT_BYTES) return null;
  const bytes = await request.arrayBuffer();
  return bytes.byteLength > MAX_EVENT_BYTES ? null : new TextDecoder().decode(bytes);
}
