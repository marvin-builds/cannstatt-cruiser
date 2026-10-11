import { describe, expect, it } from 'vitest';
import { parseStatusIds } from '../src/feedback-status-parse';
import { MAX_STATUS_IDS } from '../src/feedback-rules';

const params = (query: string) => new URL(`https://worker.example/feedback/status${query}`).searchParams;

describe('parseStatusIds', () => {
  it('reads one comma-separated list of positive ids, without duplicates', () => {
    expect(parseStatusIds(params('?ids=1'))).toEqual([1]);
    expect(parseStatusIds(params('?ids=12,3,4711'))).toEqual([12, 3, 4711]);
    expect(parseStatusIds(params('?ids=5,5,6'))).toEqual([5, 6]);
  });

  it(`accepts at most ${MAX_STATUS_IDS} ids`, () => {
    const ids = Array.from({ length: MAX_STATUS_IDS }, (_, i) => i + 1);
    expect(parseStatusIds(params(`?ids=${ids.join(',')}`))).toEqual(ids);
    expect(parseStatusIds(params(`?ids=${[...ids, 11].join(',')}`))).toBeNull();
  });

  it('rejects anything but digits and commas', () => {
    for (const query of [
      '', '?ids=', '?ids=,', '?ids=1,', '?ids=,1', '?ids=1,,2', '?ids=0', '?ids=01', '?ids=-1', '?ids=1.5', '?ids=1e3', '?ids=abc',
      '?ids=1%202', '?ids=%201', '?ids=1;2', '?ids=9007199254740993', `?ids=${'1'.repeat(400)}`,
    ]) {
      expect(parseStatusIds(params(query)), query).toBeNull();
    }
  });

  it('rejects a repeated ids parameter and any other parameter', () => {
    expect(parseStatusIds(params('?ids=1&ids=2'))).toBeNull();
    expect(parseStatusIds(params('?ids=1&device=abc'))).toBeNull();
  });
});
