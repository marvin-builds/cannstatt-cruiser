import { describe, expect, it } from 'vitest';
import { DRUNK_DELAY_MAX, DRUNK_DELAY_MIN, DRUNK_HOLD_WOBBLE, TICK_RATE } from './config';

// Players did not notice a 50-100 ms delay; drunk controls must be felt.
describe('drunk tuning', () => {
  it('delays every press by a clearly noticeable 130-330 ms', () => {
    expect((DRUNK_DELAY_MIN / TICK_RATE) * 1000).toBeGreaterThanOrEqual(130);
    expect((DRUNK_DELAY_MAX / TICK_RATE) * 1000).toBeGreaterThanOrEqual(320);
  });

  it('makes jump height unreliable by wobbling hold lengths', () => {
    expect(DRUNK_HOLD_WOBBLE).toBeGreaterThanOrEqual(8);
  });
});
