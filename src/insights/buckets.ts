/**
 * Regroups the fine histogram buckets of GET /stats (keys are lower bounds as
 * strings) into the few labelled bars the board shows.
 */
import type { CountEntry } from '../net/telemetry-types';
import { formatNumber } from './format';

export interface Group {
  /** Inclusive lower bound; a group runs up to the next group's bound. */
  from: number;
  label: string;
}

/** Sums each entry into the last group whose bound is <= its key; all groups returned, in order. */
export function regroup(entries: readonly CountEntry[], groups: readonly Group[]): CountEntry[] {
  const counts = groups.map(() => 0);
  for (const { key, count } of entries) {
    const value = Number(key);
    if (key === '' || !Number.isFinite(value)) continue;
    let index = -1;
    groups.forEach((g, i) => {
      if (g.from <= value) index = i;
    });
    if (index >= 0) counts[index]! += count;
  }
  return groups.map((g, i) => ({ key: g.label, count: counts[i]! }));
}

const RUN_LENGTH: Group[] = [
  { from: 0, label: '<30 s' },
  { from: 30, label: '30-60 s' },
  { from: 60, label: '1-3 min' },
  { from: 180, label: '3-10 min' },
  { from: 600, label: '10+ min' },
];

const DISTANCE: Group[] = [
  { from: 0, label: '<200 m' },
  { from: 200, label: '200-500 m' },
  { from: 500, label: '0,5-1 km' },
  { from: 1000, label: '1-2 km' },
  { from: 2000, label: '2+ km' },
];

/** Follows SCORE_BUCKETS: one bar per bucket. */
const SCORE: Group[] = [
  { from: 0, label: `<${formatNumber(100)}` },
  { from: 100, label: `${formatNumber(100)}-${formatNumber(500)}` },
  { from: 500, label: `${formatNumber(500)}-${formatNumber(2000)}` },
  { from: 2000, label: `${formatNumber(2000)}-${formatNumber(5000)}` },
  { from: 5000, label: `${formatNumber(5000)}+` },
];

export const runLengthGroups = (entries: readonly CountEntry[]) => regroup(entries, RUN_LENGTH);
export const distanceGroups = (entries: readonly CountEntry[]) => regroup(entries, DISTANCE);
export const scoreGroups = (entries: readonly CountEntry[]) => regroup(entries, SCORE);
