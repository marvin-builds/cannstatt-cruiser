/** One request given up after a timeout: the response, or null when offline, timed out or the fetch threw. */
import type { FetchLike, FetchResponse } from './api';

type Init = Parameters<FetchLike>[1];

export async function timedFetch(fetchFn: FetchLike, url: string, init: Init, timeoutMs: number): Promise<FetchResponse | null> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => fetchFn(url, { ...init, signal: controller?.signal }))(), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The JSON body, or undefined when it is not JSON. */
export async function jsonBody(response: FetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
