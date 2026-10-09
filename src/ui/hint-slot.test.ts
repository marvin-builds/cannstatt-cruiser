import { describe, expect, it } from 'vitest';
import type { HintKind } from './hint-plate';
import { HINT_MIN_TIME, HINT_NO_SWAP, HintSlot } from './hint-slot';

const TICK = 1 / 60;
const none = { highFive: false, trick: false, air: false, kicker: false };
const want = (...kinds: HintKind[]) => ({ ...none, ...Object.fromEntries(kinds.map((k) => [k, true])) });

/** Runs the slot for `seconds` with the same wants, returning what showed on every tick. */
function run(slot: HintSlot, seconds: number, wants = none): (HintKind | null)[] {
  const shown: (HintKind | null)[] = [];
  for (let t = 0; t < seconds - 1e-9; t += TICK) {
    slot.update(TICK, wants);
    shown.push(slot.kind);
  }
  return shown;
}

describe('hint slot: one riding hint at a time, long enough to read', () => {
  it('constants: at least ~1.8 s on screen, no swap within ~1 s', () => {
    expect(HINT_MIN_TIME).toBeGreaterThanOrEqual(1.8);
    expect(HINT_NO_SWAP).toBeGreaterThanOrEqual(1);
  });

  it('a hint that stops wanting after 0.2 s (a short grind, a landing) lingers until its minimum time', () => {
    const slot = new HintSlot();
    run(slot, 0.2, want('trick'));
    expect(slot.kind).toBe('trick');
    const after = run(slot, HINT_MIN_TIME - 0.2 - 2 * TICK);
    expect(after.every((k) => k === 'trick')).toBe(true);
    run(slot, 4 * TICK);
    expect(slot.kind).toBeNull();
  });

  it('stays as long as it is wanted', () => {
    const slot = new HintSlot();
    run(slot, 5, want('kicker'));
    expect(slot.kind).toBe('kicker');
  });

  it('a higher hint never replaces the shown one within the no-swap time, then it may', () => {
    const slot = new HintSlot();
    run(slot, 0.1, want('kicker'));
    const early = run(slot, HINT_NO_SWAP - 0.1 - 2 * TICK, want('kicker', 'trick'));
    expect(early.every((k) => k === 'kicker')).toBe(true);
    run(slot, 4 * TICK, want('kicker', 'trick'));
    expect(slot.kind).toBe('trick');
  });

  it('a lower hint waits too: no swap within the no-swap time of the lingering hint', () => {
    const slot = new HintSlot();
    run(slot, 0.1, want('air'));
    const early = run(slot, HINT_NO_SWAP - 0.1 - 2 * TICK, want('kicker'));
    expect(early.every((k) => k === 'air')).toBe(true);
    run(slot, 4 * TICK, want('kicker'));
    expect(slot.kind).toBe('kicker');
  });

  it('a lower hint never replaces a hint that is still wanted', () => {
    const slot = new HintSlot();
    const shown = run(slot, 3, want('highFive', 'kicker'));
    expect(shown.every((k) => k === 'highFive')).toBe(true);
  });

  it('the ramp hint never cuts a showing high five hint short: it waits until the high five hint had its minimum time', () => {
    const slot = new HintSlot();
    run(slot, 0.1, want('highFive'));
    const early = run(slot, HINT_MIN_TIME - 0.1 - 2 * TICK, want('kicker'));
    expect(early.every((k) => k === 'highFive')).toBe(true);
    run(slot, 4 * TICK, want('kicker'));
    expect(slot.kind).toBe('kicker');
  });

  it('dismiss hides a hint whose job is done at once (trick started, launched off the kicker)', () => {
    const slot = new HintSlot();
    run(slot, 0.1, want('kicker'));
    slot.dismiss('kicker');
    expect(slot.kind).toBeNull();
    run(slot, TICK, want('air'));
    expect(slot.kind).toBe('air');
    slot.dismiss('kicker'); // not the shown one: nothing changes
    expect(slot.kind).toBe('air');
  });

  it('a new run clears it', () => {
    const slot = new HintSlot();
    run(slot, 0.1, want('trick'));
    slot.runStarted();
    expect(slot.kind).toBeNull();
  });
});
