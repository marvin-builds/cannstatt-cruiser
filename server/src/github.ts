/**
 * Creates GitHub issues and reads their state with the REST API. `fetch` is injected, so tests never
 * reach GitHub. The token goes only into the Authorization header; a failure
 * reports GitHub's status code and nothing of the answer, so nothing can echo it back.
 */
import { utcDay } from './aggregate';
import { ISSUE_REPO } from './feedback-triage-rules';
import type { IssueState } from './feedback-triage-types';

export type GitHubFetch = (url: string, init: RequestInit) => Promise<Response>;

const API_VERSION = '2022-11-28';
/** GitHub rejects API requests without a User-Agent. */
const USER_AGENT = 'cannstatt-cruiser-scores (Cloudflare Worker)';

const ISSUES_URL = `https://api.github.com/repos/${ISSUE_REPO}/issues`;
/** A read gives up after this long, so a slow GitHub never holds up the board (ROADMAP 82). */
export const GITHUB_READ_TIMEOUT_MS = 3000;

const headers = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': USER_AGENT,
  'X-GitHub-Api-Version': API_VERSION,
});

export interface NewIssue {
  title: string;
  body: string;
  labels: string[];
}

/** `status` is GitHub's HTTP status, or 0 when the request failed or the answer was unusable. */
export type IssueResult = { ok: true; number: number } | { ok: false; status: number };

export async function createIssue(fetchFn: GitHubFetch, token: string, issue: NewIssue): Promise<IssueResult> {
  let response: Response;
  try {
    response = await fetchFn(ISSUES_URL, {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(issue),
    });
  } catch {
    return { ok: false, status: 0 };
  }
  if (response.status !== 201) return { ok: false, status: response.status };
  const answer: unknown = await response.json().catch(() => null);
  const number = (answer as { number?: unknown } | null)?.number;
  return Number.isSafeInteger(number) && (number as number) > 0 ? { ok: true, number: number as number } : { ok: false, status: 0 };
}

/** An issue's state as the board shows it: closedDay is the UTC day of `closed_at`, null while open. */
export interface IssueReading {
  state: IssueState;
  closedDay: string | null;
}

/** One answer item of the issues API as an IssueReading, or null for a pull request or anything malformed. */
export function issueReading(item: unknown): IssueReading | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
  const { number, state, state_reason: reason, closed_at: closedAt, pull_request: pullRequest } = item as Record<string, unknown>;
  if (!Number.isSafeInteger(number) || pullRequest !== undefined) return null;
  if (state === 'open') return { state: 'open', closedDay: null };
  if (state !== 'closed') return null;
  const closedMs = typeof closedAt === 'string' ? Date.parse(closedAt) : NaN;
  return {
    state: reason === 'not_planned' || reason === 'duplicate' ? 'notPlanned' : 'completed',
    closedDay: Number.isFinite(closedMs) ? utcDay(closedMs) : null,
  };
}

/** GET with the read timeout: the response, or null on a network error or timeout (the request is aborted then). */
async function getWithTimeout(fetchFn: GitHubFetch, token: string, url: string): Promise<Response | null> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      abort.abort();
      resolve(null);
    }, GITHUB_READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fetchFn(url, { method: 'GET', headers: headers(token), signal: abort.signal }), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The states of the repo's 100 most recently updated issues by number (pull requests and malformed items left out),
 * or null when GitHub fails, answers unusably or is too slow.
 */
export async function listIssueStates(fetchFn: GitHubFetch, token: string): Promise<Map<number, IssueReading> | null> {
  const response = await getWithTimeout(fetchFn, token, `${ISSUES_URL}?state=all&per_page=100&sort=updated`);
  if (response?.status !== 200) return null;
  const answer: unknown = await response.json().catch(() => null);
  if (!Array.isArray(answer)) return null;
  const states = new Map<number, IssueReading>();
  for (const item of answer) {
    const reading = issueReading(item);
    if (reading) states.set((item as { number: number }).number, reading);
  }
  return states;
}

/** `missing`: GitHub answered 404 or 410, or the number is a pull request. `error.status` is 0 for a network error, timeout or broken answer. */
export type IssueLookup = { kind: 'issue'; reading: IssueReading } | { kind: 'missing' } | { kind: 'error'; status: number };

/** Reads one issue of ISSUE_REPO by number. */
export async function readIssue(fetchFn: GitHubFetch, token: string, number: number): Promise<IssueLookup> {
  const response = await getWithTimeout(fetchFn, token, `${ISSUES_URL}/${number}`);
  if (!response) return { kind: 'error', status: 0 };
  if (response.status === 404 || response.status === 410) return { kind: 'missing' };
  if (response.status !== 200) return { kind: 'error', status: response.status };
  const answer: unknown = await response.json().catch(() => null);
  if (typeof answer === 'object' && answer !== null && 'pull_request' in answer) return { kind: 'missing' };
  const reading = issueReading(answer);
  return reading ? { kind: 'issue', reading } : { kind: 'error', status: 0 };
}
