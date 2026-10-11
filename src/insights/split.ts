/** Turns CountEntry lists of GET /stats into 100 % split bars and ranked lists. */
import type { CountEntry } from '../net/telemetry-types';

export const OTHER_KEY = 'other';
export const OTHER_LABEL = 'Andere';

export interface SplitKey {
  key: string;
  label: string;
  /** Further keys counted into this segment. */
  aliases?: readonly string[];
}

export interface Segment {
  key: string;
  label: string;
  count: number;
  /** 0..1 of all sessions in the split. */
  fraction: number;
  /** Whole percent; the segments add up to 100 (largest remainder). */
  percent: number;
}

/** Whole percents of `counts` that add up to 100 (all 0 without data). */
function wholePercents(counts: readonly number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const floors = exact.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((e, i) => ({ i, r: e - floors[i]! })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (rest <= 0) break;
    floors[i]!++;
    rest--;
  }
  return floors;
}

/** Segments in the order of `keys` (zeros kept); unknown keys are summed into a trailing 'Andere'. */
export function splitSegments(entries: readonly CountEntry[], keys: readonly SplitKey[]): Segment[] {
  const counts = keys.map(() => 0);
  let other = 0;
  for (const { key, count } of entries) {
    const index = keys.findIndex((k) => k.key === key || k.aliases?.includes(key));
    if (index >= 0) counts[index]! += count;
    else other += count;
  }
  const rows = keys.map((k, i) => ({ key: k.key, label: k.label, count: counts[i]! }));
  if (other > 0) rows.push({ key: OTHER_KEY, label: OTHER_LABEL, count: other });
  const total = rows.reduce((a, r) => a + r.count, 0);
  const percents = wholePercents(rows.map((r) => r.count));
  return rows.map((r, i) => ({ ...r, fraction: total ? r.count / total : 0, percent: percents[i]! }));
}

export interface RankedRow {
  key: string;
  label: string;
  count: number;
  /** 0..1 of the list's total. */
  share: number;
  /** 0..1 bar length, relative to the largest row. */
  bar: number;
}

/** Largest first, the 'other' group last and labelled 'Andere'. */
export function rankedRows(entries: readonly CountEntry[], label: (key: string) => string = (k) => k): RankedRow[] {
  const total = entries.reduce((a, e) => a + e.count, 0);
  const max = entries.reduce((a, e) => Math.max(a, e.count), 0);
  const isOther = (e: CountEntry) => e.key === OTHER_KEY;
  const sorted = [...entries.filter((e) => !isOther(e)).sort((a, b) => b.count - a.count), ...entries.filter(isOther)];
  return sorted.map((e) => ({
    key: e.key,
    label: isOther(e) ? OTHER_LABEL : label(e.key),
    count: e.count,
    share: total ? e.count / total : 0,
    bar: max ? e.count / max : 0,
  }));
}
