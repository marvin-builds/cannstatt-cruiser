/**
 * HTTP API: GET /top, POST /score, OPTIONS preflight. Uses only the request
 * body and the Origin header; never the client IP or other headers.
 */
import { corsHeaders } from './cors';
import { rankRows } from './ranking';
import { isRateLimited } from './rate-limit';
import { hashDevice, recentSubmissions, saveRun, topRows } from './store';
import { parseSubmission } from './submission';

export interface Env {
  DB: D1Database;
}

/** Larger bodies are rejected unread beyond this many characters. */
const MAX_BODY = 2048;
const TOP_CACHE = 'public, max-age=30';

type Failure = 'bad-request' | 'name' | 'implausible' | 'rate' | 'not-found';
const STATUS: Record<Failure, number> = { 'bad-request': 400, name: 422, implausible: 422, rate: 429, 'not-found': 404 };

export async function handleRequest(request: Request, env: Env, now: number): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'));
  const json = (body: unknown, status: number, cache = 'no-store') =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });
  const fail = (error: Failure) => json({ ok: false, error }, STATUS[error]);

  const { pathname } = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method === 'GET' && pathname === '/top') {
    return json({ entries: rankRows(await topRows(env.DB), null).entries }, 200, TOP_CACHE);
  }
  if (request.method !== 'POST' || pathname !== '/score') return fail('not-found');

  const parsed = parseSubmission(await readJson(request));
  if (!parsed.ok) return fail(parsed.error);
  const device = await hashDevice(parsed.value.device);
  if (isRateLimited(await recentSubmissions(env.DB, device, now), now)) return fail('rate');
  const id = await saveRun(env.DB, parsed.value, device, now);
  const { entries, rank } = rankRows(await topRows(env.DB), id);
  return json({ ok: true, rank, entries }, 200);
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
