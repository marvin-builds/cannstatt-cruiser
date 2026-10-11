/** Pure helpers for the statistics: UTC days and count lists. */
import type { CountEntry } from './insights-types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Key of merged small or unknown groups. */
const OTHER = 'other';

/** YYYY-MM-DD (UTC) of a time in ms. */
export const utcDay = (at: number): string => new Date(at).toISOString().slice(0, 10);
export const utcHour = (at: number): number => new Date(at).getUTCHours();

/** The `days` UTC days ending with the day of `now`, oldest first. */
export function dayRange(now: number, days: number): string[] {
  return Array.from({ length: days }, (_, i) => utcDay(now - (days - 1 - i) * DAY_MS));
}

/**
 * Counts of raw values summed into the largest of the ascending lower `bounds`
 * at or below each value; one entry per bound, zero-filled, keys as strings.
 * Values below the first bound and unknown values are left out.
 */
export function histogram(bounds: readonly number[], rows: readonly { key: number | null; count: number }[]): CountEntry[] {
  const counts = bounds.map(() => 0);
  for (const { key, count } of rows) {
    if (key === null) continue;
    const index = bounds.filter((bound) => bound <= key).length - 1;
    if (index >= 0) counts[index]! += count;
  }
  return bounds.map((bound, i) => ({ key: String(bound), count: counts[i]! }));
}

/** Largest count first; equal counts by key. */
export function largestFirst(entries: readonly CountEntry[]): CountEntry[] {
  return [...entries].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Groups below `min` and unknown (null) keys are merged into OTHER; largest first. */
export function mergeSmallGroups(rows: readonly { key: string | null; count: number }[], min: number): CountEntry[] {
  const kept: CountEntry[] = [];
  let other = 0;
  for (const { key, count } of rows) {
    if (key === null || count < min) other += count;
    else kept.push({ key, count });
  }
  return largestFirst(other > 0 ? [...kept, { key: OTHER, count: other }] : kept);
}
