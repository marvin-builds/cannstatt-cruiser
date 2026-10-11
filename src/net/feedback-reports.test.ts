import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import {
  dropLegacyFeedbackKeys,
  FEEDBACK_SENT_KEY,
  keepReport,
  loadReports,
  newFeedbackKey,
  reportChanged,
  type SentReport,
  sentReport,
} from './feedback-reports';
import { FEEDBACK_KEY_PATTERN, type FeedbackBody, MAX_STATUS_ITEMS } from './feedback-types';

const KEY = 'a'.repeat(32);

const BODY: FeedbackBody = {
  session: 'b'.repeat(32),
  kind: 'bug',
  text: 'Der Skater bleibt hängen',
  version: '2026-10-11.10',
  platform: 'android',
  input: 'touch',
  orientation: 'landscape',
  viewWidth: 390,
  log: ['error: boom (index.js:1)', 'state: mode title, version 2026-10-11.10, view 390x180'],
  key: KEY,
};

const report = (id: number, extra: Partial<SentReport> = {}): SentReport => ({ ...sentReport(BODY, id, '2026-10-11'), ...extra });

describe('report keys', () => {
  it('are 32 lowercase hex characters from 16 random bytes', () => {
    const key = newFeedbackKey((bytes) => bytes.map((_, i) => i * 17));
    expect(key).toBe('00112233445566778899aabbccddeeff');
    expect(FEEDBACK_KEY_PATTERN.test(newFeedbackKey())).toBe(true);
    expect(newFeedbackKey()).not.toBe(newFeedbackKey());
  });
});

describe('sent reports on the device', () => {
  it('keep what was sent (text, details, log, key), but never the session id', () => {
    const r = sentReport(BODY, 7, '2026-10-11');
    expect(r).toEqual({
      id: 7,
      key: KEY,
      day: '2026-10-11',
      kind: 'bug',
      text: 'Der Skater bleibt hängen',
      version: '2026-10-11.10',
      platform: 'android',
      input: 'touch',
      orientation: 'landscape',
      viewWidth: 390,
      log: BODY.log,
    });
    expect(JSON.stringify(r)).not.toContain(BODY.session);
  });

  it('are kept newest last as open and seen, at most MAX_STATUS_ITEMS, across page loads', () => {
    const store = createMemoryStore();
    expect(loadReports(store)).toEqual([]);
    for (let id = 1; id <= MAX_STATUS_ITEMS + 3; id++) keepReport(store, report(id));
    const kept = loadReports(store);
    expect(kept.map((r) => r.id)).toEqual(Array.from({ length: MAX_STATUS_ITEMS }, (_, i) => i + 4));
    expect(kept[0]).toMatchObject({ status: 'open', reply: null, doneVersion: null, text: BODY.text, log: BODY.log, key: KEY });
    expect(kept.every((r) => !reportChanged(r))).toBe(true);
  });

  it('keep a report once', () => {
    const store = createMemoryStore();
    keepReport(store, report(7));
    keepReport(store, report(8));
    keepReport(store, report(7, { text: 'neu' }));
    expect(loadReports(store).map((r) => [r.id, r.text])).toEqual([
      [8, BODY.text],
      [7, 'neu'],
    ]);
  });

  it('ignore a damaged stored value and drop damaged reports', () => {
    for (const value of ['x', { a: 1 }, null, 3]) {
      const store = createMemoryStore();
      store.set(FEEDBACK_SENT_KEY, value);
      expect(loadReports(store)).toEqual([]);
    }
    const store = createMemoryStore();
    keepReport(store, report(1));
    keepReport(store, report(2));
    const raw = store.get<Record<string, unknown>[]>(FEEDBACK_SENT_KEY, []);
    store.set(FEEDBACK_SENT_KEY, [{ ...raw[0], key: 'nope' }, raw[1], { id: 3 }, 'junk', { ...raw[1], id: -1 }]);
    expect(loadReports(store).map((r) => r.id)).toEqual([2]);
  });

  it('forget the ids and notes of ROADMAP 57 (reports without a key cannot be asked about)', () => {
    const store = createMemoryStore();
    store.set('feedbackIds', [3, 5]);
    store.set('feedbackNotes', { checked: '2026-10-11', entries: [], seen: [] });
    dropLegacyFeedbackKeys(store);
    expect(store.get('feedbackIds', 'gone')).toBeNull();
    expect(store.get('feedbackNotes', 'gone')).toBeNull();
    const untouched = createMemoryStore();
    dropLegacyFeedbackKeys(untouched);
    expect(untouched.get('feedbackIds', 'gone')).toBe('gone');
  });
});
