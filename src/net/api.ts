/**
 * Typed client for the highscore worker (server/README.md): `GET /top` and
 * `POST /score`, each given up after REQUEST_TIMEOUT_MS. Every failure is
 * mapped to a ScoreError, nothing throws. `fetch` is passed in, so unit tests
 * use a fake and never reach the public list.
 */

export const SCORES_URL = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
/** A request that takes longer counts as offline. */
export const REQUEST_TIMEOUT_MS = 6000;

export interface ScoreEntry {
  /** 1-based place. */
  rank: number;
  name: string;
  score: number;
  /** Metres. */
  distance: number;
  /** ISO timestamp (UTC). */
  date: string;
}

/** The POST /score body: integers as the server requires (see payload.ts). */
export interface ScoreSubmission {
  name: string;
  score: number;
  /** Metres. */
  distance: number;
  /** Whole seconds of play, > 0. */
  duration: number;
  version: string;
  device: string;
}

/** offline = no connection or timeout; server = any answer outside the contract (5xx, 404, junk). */
export type ScoreError = 'offline' | 'name' | 'implausible' | 'rate' | 'bad-request' | 'server';

/** The device's own row (GET /top?device=...): `rank` within the top 20, or null outside it. */
export interface OwnEntry {
  rank: number | null;
  score: number;
}

/**
 * `own`: null when the device has no row; absent when the list was asked
 * without a device or an older worker does not send it (unknown).
 */
export type TopResult = { ok: true; entries: ScoreEntry[]; own?: OwnEntry | null } | { ok: false; error: ScoreError };

/**
 * `stored`: the run replaced the device's row (it beat it) or created it.
 * `best`: the device's stored score after the request. `rank`: its row's
 * place in the top 20, or null.
 */
export type SubmitResult =
  | { ok: true; stored: boolean; rank: number | null; best: number; entries: ScoreEntry[] }
  | { ok: false; error: ScoreError };

/** The part of a fetch Response the client reads. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponse>;

export interface ScoresApiOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isRank = (v: unknown): v is number | null => v === null || isCount(v);

function parseEntry(v: unknown): ScoreEntry | null {
  if (!isRecord(v)) return null;
  const { rank, name, score, distance, date } = v;
  if (!isCount(rank) || typeof name !== 'string' || !isCount(score) || !isCount(distance) || typeof date !== 'string') return null;
  return { rank, name, score, distance, date };
}

function parseEntries(v: unknown): ScoreEntry[] | null {
  if (!isRecord(v) || !Array.isArray(v.entries)) return null;
  return v.entries.map(parseEntry).filter((e): e is ScoreEntry => e !== null);
}

/** `own` of a GET /top answer: null, a valid row, or undefined when the answer is malformed. */
function parseOwn(v: unknown): OwnEntry | null | undefined {
  if (v === null) return null;
  if (!isRecord(v) || !isRank(v.rank) || !isCount(v.score)) return undefined;
  return { rank: v.rank, score: v.score };
}

/** `stored` and `best` of a POST answer; an older worker sends neither (it stored every run). */
function parseStored(body: Record<string, unknown>, score: number): { stored: boolean; best: number } | null {
  const { stored, best } = body;
  if (stored === undefined && best === undefined) return { stored: true, best: score };
  return typeof stored === 'boolean' && isCount(best) ? { stored, best } : null;
}

/** Error codes the server sends with 422. */
const REFUSALS: readonly ScoreError[] = ['name', 'implausible'];

function submitError(status: number, body: unknown): ScoreError {
  if (status === 429) return 'rate';
  if (status === 400) return 'bad-request';
  const error = isRecord(body) ? body.error : null;
  if (status === 422 && REFUSALS.includes(error as ScoreError)) return error as ScoreError;
  return 'server';
}

interface Answer {
  status: number;
  body: unknown;
}

export class ScoresApi {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly fetchFn: FetchLike,
    options: ScoresApiOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? SCORES_URL;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  /** The top list; with `device` also that device's own row (`own`). */
  async top(device?: string): Promise<TopResult> {
    const answer = await this.request(device === undefined ? '/top' : `/top?device=${encodeURIComponent(device)}`);
    if (!answer) return { ok: false, error: 'offline' };
    const entries = answer.status === 200 ? parseEntries(answer.body) : null;
    if (!entries) return { ok: false, error: 'server' };
    const raw = isRecord(answer.body) ? answer.body.own : undefined;
    if (raw === undefined) return { ok: true, entries };
    const own = parseOwn(raw);
    return own === undefined ? { ok: false, error: 'server' } : { ok: true, entries, own };
  }

  async submit(run: ScoreSubmission): Promise<SubmitResult> {
    const answer = await this.request('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
    if (!answer) return { ok: false, error: 'offline' };
    const { status, body } = answer;
    if (status !== 200) return { ok: false, error: submitError(status, body) };
    const entries = parseEntries(body);
    if (!entries || !isRecord(body) || body.ok !== true || !isRank(body.rank)) return { ok: false, error: 'server' };
    const kept = parseStored(body, run.score);
    if (!kept) return { ok: false, error: 'server' };
    return { ok: true, stored: kept.stored, rank: body.rank, best: kept.best, entries };
  }

  /** The status and parsed JSON body (null when not JSON), or null when offline or timed out. */
  private async request(path: string, init: Parameters<FetchLike>[1] = {}): Promise<Answer | null> {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller?.abort();
        resolve(null);
      }, this.timeoutMs);
    });
    const call = async (): Promise<Answer | null> => {
      const response = await this.fetchFn(this.baseUrl + path, { ...init, signal: controller?.signal });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Not JSON: the status alone decides (an error outside the contract).
      }
      return { status: response.status, body };
    };
    try {
      return await Promise.race([call(), timeout]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
