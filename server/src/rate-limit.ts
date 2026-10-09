/**
 * Per-device rate limit: at most one accepted submission per MIN_GAP_MS and
 * MAX_PER_DAY in any rolling day. Works on the times (ms) of the device's
 * earlier accepted submissions.
 */
export const MIN_GAP_MS = 20_000;
export const MAX_PER_DAY = 50;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function isRateLimited(earlier: readonly number[], now: number): boolean {
  const today = earlier.filter((at) => at > now - DAY_MS);
  return today.length >= MAX_PER_DAY || today.some((at) => at > now - MIN_GAP_MS);
}
