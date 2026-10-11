import { describe, expect, it } from 'vitest';
import { feedbackCount, filterFeedback, kindLabel, logSummary, metaLine } from './feedback';
import { sampleFeedback } from './sample-feedback';
import type { FeedbackStatus, TriagedFeedbackEntry } from './triage-types';

const entry = (id: number, day: string, kind: TriagedFeedbackEntry['kind'], status: FeedbackStatus = 'open'): TriagedFeedbackEntry => ({
  id,
  day,
  kind,
  text: 'Hallo',
  version: '2026-10-11.4',
  platform: 'android',
  input: 'touch',
  orientation: 'portrait',
  viewWidth: 390,
  log: [],
  status,
  issue: null,
  reply: null,
  doneVersion: null,
});

describe('filterFeedback', () => {
  const entries = [entry(1, '2026-10-09', 'bug'), entry(3, '2026-10-11', 'idea'), entry(2, '2026-10-11', 'bug')];
  it('keeps all entries, newest day first and the higher id first within a day', () => {
    expect(filterFeedback(entries, 'all').map((e) => e.id)).toEqual([3, 2, 1]);
  });
  it('keeps only bugs or only ideas', () => {
    expect(filterFeedback(entries, 'bug').map((e) => e.id)).toEqual([2, 1]);
    expect(filterFeedback(entries, 'idea').map((e) => e.id)).toEqual([3]);
  });
  it('keeps only one status, combined with the kind', () => {
    const triaged = [...entries, entry(4, '2026-10-11', 'bug', 'todo'), entry(5, '2026-10-10', 'idea', 'rejected')];
    expect(filterFeedback(triaged, 'all', 'open').map((e) => e.id)).toEqual([3, 2, 1]);
    expect(filterFeedback(triaged, 'all', 'todo').map((e) => e.id)).toEqual([4]);
    expect(filterFeedback(triaged, 'bug', 'rejected')).toEqual([]);
    expect(filterFeedback(triaged, 'idea', 'rejected').map((e) => e.id)).toEqual([5]);
    expect(filterFeedback(triaged, 'all', 'all')).toHaveLength(5);
  });
  it('does not change the input', () => {
    filterFeedback(entries, 'all');
    expect(entries.map((e) => e.id)).toEqual([1, 3, 2]);
  });
});

describe('labels', () => {
  it('names the kinds in German', () => {
    expect(kindLabel('bug')).toBe('Fehler');
    expect(kindLabel('idea')).toBe('Idee');
  });
  it('builds the meta line from version, system, input, orientation and view width', () => {
    expect(metaLine(entry(1, '2026-10-11', 'bug'))).toBe('Version 2026-10-11.4 · Android · Touch · Hoch · 390 px');
    expect(metaLine({ ...entry(1, '2026-10-11', 'bug'), platform: 'other', input: 'keys', orientation: 'landscape', viewWidth: 427 })).toBe(
      'Version 2026-10-11.4 · anderes System · Tastatur · Quer · 427 px',
    );
  });
  it('counts entries and log lines in German', () => {
    expect(feedbackCount(0)).toBe('0 Einträge');
    expect(feedbackCount(1)).toBe('1 Eintrag');
    expect(feedbackCount(12)).toBe('12 Einträge');
    expect(logSummary(1)).toBe('Fehlerprotokoll (1 Zeile)');
    expect(logSummary(4)).toBe('Fehlerprotokoll (4 Zeilen)');
  });
});

describe('sampleFeedback', () => {
  it('has a long text, a bug with log, markup as text and both kinds', () => {
    const list = sampleFeedback();
    expect(list.some((e) => e.text.length > 300)).toBe(true);
    expect(list.some((e) => e.kind === 'bug' && e.log.length > 0)).toBe(true);
    expect(list.some((e) => e.text.includes('<script>'))).toBe(true);
    expect(new Set(list.map((e) => e.kind))).toEqual(new Set(['bug', 'idea']));
    expect(list.some((e) => e.status === 'todo' && e.issue !== null)).toBe(true);
    expect(list.some((e) => e.status === 'rejected' && e.reply)).toBe(true);
  });
});
