import { describe, expect, it } from 'vitest';
import { SETTLE_MAX_MS, SETTLE_QUIET_MS, ViewSettle } from './view-settle';

const PORTRAIT_KEYBOARD = { width: 412, height: 915, visualHeight: 520 };
const PORTRAIT = { width: 412, height: 915, visualHeight: 915 };
const LANDSCAPE = { width: 915, height: 412, visualHeight: 412 };

describe('view settle after closing a portrait form (ROADMAP 75)', () => {
  it('waits for the keyboard to go down, the turn to landscape and a quiet stretch without resizes', () => {
    const s = new ViewSettle();
    s.begin(0, true);
    expect(s.settled(SETTLE_QUIET_MS + 10, PORTRAIT_KEYBOARD)).toBe(false);
    s.changed(200);
    expect(s.settled(SETTLE_QUIET_MS + 210, PORTRAIT)).toBe(false); // still portrait: the lock has not turned it yet
    s.changed(600);
    expect(s.settled(700, LANDSCAPE)).toBe(false); // the turn is still resizing
    expect(s.settled(600 + SETTLE_QUIET_MS, LANDSCAPE)).toBe(true);
  });

  it('without a landscape lock it settles once the keyboard is down and the size is quiet', () => {
    const s = new ViewSettle();
    s.begin(1000, false);
    expect(s.settled(1000 + SETTLE_QUIET_MS - 1, PORTRAIT)).toBe(false);
    expect(s.settled(1000 + SETTLE_QUIET_MS, PORTRAIT)).toBe(true);
  });

  it('gives up after SETTLE_MAX_MS, whatever the size (a lock the device ignores)', () => {
    const s = new ViewSettle();
    s.begin(0, true);
    s.changed(SETTLE_MAX_MS - 5);
    expect(s.settled(SETTLE_MAX_MS - 1, PORTRAIT_KEYBOARD)).toBe(false);
    expect(s.settled(SETTLE_MAX_MS, PORTRAIT_KEYBOARD)).toBe(true);
  });

  it('a new close while waiting starts the wait again', () => {
    const s = new ViewSettle();
    s.begin(0, false);
    s.begin(SETTLE_MAX_MS - 100, true);
    expect(s.settled(SETTLE_MAX_MS + 10, PORTRAIT)).toBe(false);
  });
});
