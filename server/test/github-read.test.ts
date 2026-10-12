import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISSUE_REPO } from '../src/feedback-triage-rules';
import { GITHUB_READ_TIMEOUT_MS, issueReading, listIssueStates, readIssue, type GitHubFetch } from '../src/github';

const TOKEN = 'github_pat_11SECRETSECRETSECRET_abcdefghijklmnopqrstuvwxyz';

function fakeGitHub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: GitHubFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { calls, fetch };
}

const hanging: GitHubFetch = () => new Promise(() => {});

afterEach(() => {
  vi.useRealTimers();
});

describe('issueReading', () => {
  it('maps open, closed as done and closed as not planned or duplicate', () => {
    expect(issueReading({ number: 1, state: 'open', state_reason: null, closed_at: null })).toEqual({ state: 'open', closedDay: null });
    expect(issueReading({ number: 1, state: 'open', state_reason: 'reopened', closed_at: null })).toEqual({ state: 'open', closedDay: null });
    expect(issueReading({ number: 1, state: 'closed', state_reason: 'completed', closed_at: '2026-10-12T23:59:01Z' }))
      .toEqual({ state: 'completed', closedDay: '2026-10-12' });
    expect(issueReading({ number: 1, state: 'closed', state_reason: null, closed_at: '2026-10-01T00:00:00Z' }))
      .toEqual({ state: 'completed', closedDay: '2026-10-01' });
    expect(issueReading({ number: 1, state: 'closed', state_reason: 'not_planned', closed_at: '2026-10-12T08:00:00Z' }))
      .toEqual({ state: 'notPlanned', closedDay: '2026-10-12' });
    expect(issueReading({ number: 1, state: 'closed', state_reason: 'duplicate', closed_at: '2026-10-11T08:00:00Z' }))
      .toEqual({ state: 'notPlanned', closedDay: '2026-10-11' });
  });

  it('takes the UTC day of closed_at, null when it is missing or malformed', () => {
    expect(issueReading({ number: 1, state: 'closed', state_reason: 'completed', closed_at: '2026-10-12T23:30:00-02:00' }))
      .toEqual({ state: 'completed', closedDay: '2026-10-13' });
    expect(issueReading({ number: 1, state: 'closed', state_reason: 'completed', closed_at: 'gestern' })).toEqual({ state: 'completed', closedDay: null });
    expect(issueReading({ number: 1, state: 'closed', state_reason: 'completed' })).toEqual({ state: 'completed', closedDay: null });
  });

  it('ignores anything that is not an issue', () => {
    expect(issueReading({ number: 1, state: 'open', pull_request: { url: 'x' } })).toBeNull();
    for (const value of [null, 'x', [], { number: 1 }, { number: 1, state: 'merged' }, { state: 'open' }]) expect(issueReading(value), JSON.stringify(value)).toBeNull();
  });
});

describe('listIssueStates', () => {
  it('reads the most recently updated issues of the repo with the token only in the Authorization header', async () => {
    const github = fakeGitHub(200, [
      { number: 3, state: 'open', state_reason: null, closed_at: null },
      { number: 4, state: 'closed', state_reason: 'not_planned', closed_at: '2026-10-12T10:00:00Z', pull_request: { url: 'x' } },
      { number: 5, state: 'closed', state_reason: 'completed', closed_at: '2026-10-11T10:00:00Z' },
      { broken: true },
    ]);
    const states = await listIssueStates(github.fetch, TOKEN);
    expect(states).toEqual(new Map([[3, { state: 'open', closedDay: null }], [5, { state: 'completed', closedDay: '2026-10-11' }]]));
    const [{ url, init }] = github.calls as [{ url: string; init: RequestInit }];
    expect(url).toBe(`https://api.github.com/repos/${ISSUE_REPO}/issues?state=all&per_page=100&sort=updated`);
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
  });

  it('gives null on an error status, a broken answer or a network error', async () => {
    expect(await listIssueStates(fakeGitHub(500, []).fetch, TOKEN)).toBeNull();
    expect(await listIssueStates(fakeGitHub(200, 'kein json').fetch, TOKEN)).toBeNull();
    expect(await listIssueStates(fakeGitHub(200, { items: [] }).fetch, TOKEN)).toBeNull();
    expect(await listIssueStates(async () => { throw new Error('down'); }, TOKEN)).toBeNull();
  });

  it('gives up after the read timeout and aborts the request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const pending = listIssueStates((url, init) => { signal = init.signal; return hanging(url, init); }, TOKEN);
    await vi.advanceTimersByTimeAsync(GITHUB_READ_TIMEOUT_MS);
    expect(await pending).toBeNull();
    expect(signal?.aborted).toBe(true);
  });
});

describe('readIssue', () => {
  it('reads one issue by number', async () => {
    const github = fakeGitHub(200, { number: 9, state: 'closed', state_reason: 'completed', closed_at: '2026-10-12T10:00:00Z' });
    expect(await readIssue(github.fetch, TOKEN, 9)).toEqual({ kind: 'issue', reading: { state: 'completed', closedDay: '2026-10-12' } });
    expect(github.calls[0]!.url).toBe(`https://api.github.com/repos/${ISSUE_REPO}/issues/9`);
    expect(new Headers(github.calls[0]!.init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('calls a 404, a 410 and a pull request missing', async () => {
    expect(await readIssue(fakeGitHub(404, { message: 'Not Found' }).fetch, TOKEN, 9)).toEqual({ kind: 'missing' });
    expect(await readIssue(fakeGitHub(410, { message: 'Gone' }).fetch, TOKEN, 9)).toEqual({ kind: 'missing' });
    expect(await readIssue(fakeGitHub(200, { number: 9, state: 'open', pull_request: {} }).fetch, TOKEN, 9)).toEqual({ kind: 'missing' });
  });

  it('reports other failures with GitHub\'s status only (0 for network, timeout or a broken answer)', async () => {
    expect(await readIssue(fakeGitHub(403, { message: `nope ${TOKEN}` }).fetch, TOKEN, 9)).toEqual({ kind: 'error', status: 403 });
    expect(await readIssue(fakeGitHub(200, 'x').fetch, TOKEN, 9)).toEqual({ kind: 'error', status: 0 });
    expect(await readIssue(async () => { throw new Error('down'); }, TOKEN, 9)).toEqual({ kind: 'error', status: 0 });
    vi.useFakeTimers();
    const pending = readIssue(hanging, TOKEN, 9);
    await vi.advanceTimersByTimeAsync(GITHUB_READ_TIMEOUT_MS);
    expect(await pending).toEqual({ kind: 'error', status: 0 });
  });
});
