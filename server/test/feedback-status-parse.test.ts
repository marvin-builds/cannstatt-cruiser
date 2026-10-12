import { describe, expect, it } from 'vitest';
import { FEEDBACK_KEY_PATTERN, MAX_STATUS_ITEMS } from '../src/feedback-rules';
import { parseDeleteBody, parseStatusItems } from '../src/feedback-status-parse';

const KEY = '0123456789abcdef0123456789abcdef';
const OTHER_KEY = 'fedcba9876543210fedcba9876543210';
const body = (items: unknown) => JSON.stringify({ items });

describe('status contract (ROADMAP 70)', () => {
  it('has the documented values', () => {
    expect(MAX_STATUS_ITEMS).toBe(20);
    expect(FEEDBACK_KEY_PATTERN.source).toBe('^[0-9a-f]{32}$');
    expect(FEEDBACK_KEY_PATTERN.flags).toBe('');
  });
});

describe('parseStatusItems', () => {
  it('reads {items: [{id, key}]} with positive ids and 32-hex keys', () => {
    expect(parseStatusItems(body([{ id: 1, key: KEY }]))).toEqual([{ id: 1, key: KEY }]);
    expect(parseStatusItems(body([{ id: 12, key: KEY }, { id: 3, key: OTHER_KEY }]))).toEqual([
      { id: 12, key: KEY },
      { id: 3, key: OTHER_KEY },
    ]);
  });

  it(`accepts 1 to ${MAX_STATUS_ITEMS} items`, () => {
    const items = Array.from({ length: MAX_STATUS_ITEMS }, (_, i) => ({ id: i + 1, key: KEY }));
    expect(parseStatusItems(body(items))).toEqual(items);
    expect(parseStatusItems(body([...items, { id: 99, key: KEY }]))).toBeNull();
    expect(parseStatusItems(body([]))).toBeNull();
  });

  it('rejects bad ids', () => {
    for (const id of [0, -1, 1.5, '1', null, 9007199254740992, 1e300]) {
      expect(parseStatusItems(body([{ id, key: KEY }])), String(id)).toBeNull();
    }
  });

  it('rejects bad keys', () => {
    for (const key of [KEY.toUpperCase(), KEY.slice(1), `${KEY}0`, `${KEY.slice(0, 31)}g`, ` ${KEY.slice(1)}`, `${KEY}\n`, null, 1]) {
      expect(parseStatusItems(body([{ id: 1, key }])), String(key)).toBeNull();
    }
  });

  it('rejects any other shape', () => {
    for (const json of [
      '', 'x', '{', 'null', '[]', '{}', '{"items":{}}', '{"items":null}', body([{ id: 1 }]), body([{ key: KEY }]),
      body([{ id: 1, key: KEY, text: 'x' }]), body([[1, KEY]]), body([null]),
      JSON.stringify({ items: [{ id: 1, key: KEY }], ids: [1] }),
    ]) {
      expect(parseStatusItems(json), json).toBeNull();
    }
  });
});

describe('parseDeleteBody (ROADMAP 78)', () => {
  it('reads exactly {id, key}', () => {
    expect(parseDeleteBody(JSON.stringify({ id: 4, key: KEY }))).toEqual({ id: 4, key: KEY });
  });

  it('rejects bad ids, bad keys and any other shape', () => {
    for (const json of [
      JSON.stringify({ id: 0, key: KEY }), JSON.stringify({ id: '4', key: KEY }), JSON.stringify({ id: 4, key: KEY.toUpperCase() }),
      JSON.stringify({ id: 4 }), JSON.stringify({ key: KEY }), JSON.stringify({ id: 4, key: KEY, all: true }),
      JSON.stringify({ items: [{ id: 4, key: KEY }] }), '[]', 'null', '', '{',
    ]) {
      expect(parseDeleteBody(json), json).toBeNull();
    }
  });
});
