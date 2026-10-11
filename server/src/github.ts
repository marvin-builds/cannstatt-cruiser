/**
 * Creates a GitHub issue with the REST API. `fetch` is injected, so tests never
 * reach GitHub. The token goes only into the Authorization header; a failure
 * reports GitHub's status code and nothing of the answer, so nothing can echo it back.
 */
import { ISSUE_REPO } from './feedback-triage-rules';

export type GitHubFetch = (url: string, init: RequestInit) => Promise<Response>;

const API_VERSION = '2022-11-28';
/** GitHub rejects API requests without a User-Agent. */
const USER_AGENT = 'cannstatt-cruiser-scores (Cloudflare Worker)';

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
    response = await fetchFn(`https://api.github.com/repos/${ISSUE_REPO}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-GitHub-Api-Version': API_VERSION,
      },
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
