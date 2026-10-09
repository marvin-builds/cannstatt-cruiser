import { describe, expect, it } from 'vitest';
import { isRateLimited, DAY_MS } from '../src/rate-limit';

const now = 1_800_000_000_000;

describe('isRateLimited', () => {
  it('allows the first submission', () => {
    expect(isRateLimited([], now)).toBe(false);
  });

  it('blocks a second submission within 20 s, allows it after', () => {
    expect(isRateLimited([now - 19_999], now)).toBe(true);
    expect(isRateLimited([now - 20_000], now)).toBe(false);
  });

  it('allows 49 earlier submissions in a day, blocks the 51st', () => {
    const times = (n: number) => Array.from({ length: n }, (_, i) => now - 60_000 * (i + 1));
    expect(isRateLimited(times(49), now)).toBe(false);
    expect(isRateLimited(times(50), now)).toBe(true);
  });

  it('forgets submissions older than a day', () => {
    const old = Array.from({ length: 50 }, (_, i) => now - DAY_MS - i);
    expect(isRateLimited(old, now)).toBe(false);
  });
});
