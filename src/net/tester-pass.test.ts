import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import { MAX_TESTER_PASS_CHARS, TESTER_PASS_KEY } from './feedback-types';
import { TEST_DEVICE_KEY } from './telemetry-types';
import { loadTesterPass } from './tester-pass';

const PASS = 'tester.v1.1790000000000.abc';

function device(marked: unknown, pass: unknown) {
  const store = createMemoryStore();
  if (marked !== undefined) store.set(TEST_DEVICE_KEY, marked);
  if (pass !== undefined) store.set(TESTER_PASS_KEY, pass);
  return store;
}

describe('tester pass (ROADMAP 75)', () => {
  it('is the stored pass on a marked test device', () => {
    expect(loadTesterPass(device(true, PASS))).toBe(PASS);
  });

  it('is none on a device that is not marked, even with a pass left over', () => {
    expect(loadTesterPass(device(undefined, PASS))).toBeNull();
    expect(loadTesterPass(device(false, PASS))).toBeNull();
    expect(loadTesterPass(device('yes', PASS))).toBeNull();
  });

  it('is none without a usable pass: absent, dropped, not a string, empty or too long', () => {
    for (const pass of [undefined, null, 42, '', 'x'.repeat(MAX_TESTER_PASS_CHARS + 1)]) {
      expect(loadTesterPass(device(true, pass)), String(pass)).toBeNull();
    }
    expect(loadTesterPass(device(true, 'x'.repeat(MAX_TESTER_PASS_CHARS)))).toHaveLength(MAX_TESTER_PASS_CHARS);
  });
});
