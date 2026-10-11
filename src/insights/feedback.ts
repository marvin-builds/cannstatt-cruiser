/** Pure helpers of the feedback card: filter, order and German labels. */
import type { FeedbackEntry, FeedbackKind } from '../net/feedback-types';
import type { InputKind, Orientation, Platform } from '../net/telemetry-types';

/** The card's filter toggle: everything, only bug reports or only ideas. */
export type FeedbackFilter = 'all' | FeedbackKind;

export const FEEDBACK_FILTERS: { value: FeedbackFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'bug', label: 'Fehler' },
  { value: 'idea', label: 'Ideen' },
];

const KINDS: Record<FeedbackKind, string> = { bug: 'Fehler', idea: 'Idee' };
const PLATFORMS: Record<Platform, string> = { android: 'Android', ios: 'iOS', other: 'anderes System' };
const INPUTS: Record<InputKind, string> = { touch: 'Touch', keys: 'Tastatur' };
const ORIENTATIONS: Record<Orientation, string> = { landscape: 'Quer', portrait: 'Hoch' };

/** Entries of the filter, newest day first; within a day the later (higher) id first. */
export function filterFeedback(entries: readonly FeedbackEntry[], filter: FeedbackFilter): FeedbackEntry[] {
  return entries
    .filter((e) => filter === 'all' || e.kind === filter)
    .sort((a, b) => (a.day === b.day ? b.id - a.id : a.day < b.day ? 1 : -1));
}

export function kindLabel(kind: FeedbackKind): string {
  return KINDS[kind];
}

/** 'Version 2026-10-11.4 · Android · Touch · Hoch · 390 px' */
export function metaLine(entry: FeedbackEntry): string {
  return [`Version ${entry.version}`, PLATFORMS[entry.platform], INPUTS[entry.input], ORIENTATIONS[entry.orientation], `${entry.viewWidth} px`].join(' · ');
}

export function feedbackCount(n: number): string {
  return `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`;
}

export function logSummary(lines: number): string {
  return `Fehlerprotokoll (${lines} ${lines === 1 ? 'Zeile' : 'Zeilen'})`;
}
