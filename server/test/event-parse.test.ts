import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/event-parse';

const SESSION = '0123456789abcdef0123456789abcdef';
const session = { kind: 'session', session: SESSION, version: '2026-10-11.1', input: 'touch', orientation: 'portrait', platform: 'ios', kid: false };
const run = { kind: 'run', session: SESSION, seconds: 120, score: 500, distance: 1300, kid: true };
const end = { kind: 'end', session: SESSION, seconds: 431 };

const text = (value: unknown) => JSON.stringify(value);

describe('parseEvent', () => {
  it('accepts valid session, run and end events', () => {
    expect(parseEvent(text(session))).toEqual(session);
    expect(parseEvent(text(run))).toEqual(run);
    expect(parseEvent(text(end))).toEqual(end);
  });

  it('accepts session events with or without the optional tester and returning flags', () => {
    for (const flags of [{ tester: true }, { returning: false }, { tester: false, returning: true }]) {
      expect(parseEvent(text({ ...session, ...flags })), JSON.stringify(flags)).toEqual({ ...session, ...flags });
    }
  });

  it('rejects non-boolean tester or returning flags, and the flags on other kinds', () => {
    for (const value of [1, 0, 'true', null, {}, []]) {
      expect(parseEvent(text({ ...session, tester: value })), `tester ${JSON.stringify(value)}`).toBeNull();
      expect(parseEvent(text({ ...session, returning: value })), `returning ${JSON.stringify(value)}`).toBeNull();
    }
    expect(parseEvent(text({ ...run, tester: true }))).toBeNull();
    expect(parseEvent(text({ ...end, returning: true }))).toBeNull();
  });

  it('accepts the range edges', () => {
    expect(parseEvent(text({ ...run, seconds: 0, distance: 0, score: 0 }))).not.toBeNull();
    expect(parseEvent(text({ ...run, seconds: 3600, distance: 5000, score: 5000 }))).not.toBeNull();
    expect(parseEvent(text({ ...end, seconds: 0 }))).not.toBeNull();
    expect(parseEvent(text({ ...end, seconds: 4 * 3600 }))).not.toBeNull();
  });

  it('rejects text that is not a JSON object', () => {
    for (const body of ['{not json', '[]', 'null', '"session"', '42']) expect(parseEvent(body), body).toBeNull();
  });

  it('rejects unknown kinds, unknown extra fields and missing fields', () => {
    expect(parseEvent(text({ ...end, kind: 'click' }))).toBeNull();
    expect(parseEvent(text({ ...session, name: 'Fuchs' }))).toBeNull();
    expect(parseEvent(text({ ...run, version: '2026-10-11.1' }))).toBeNull();
    expect(parseEvent(text({ ...end, kid: false }))).toBeNull();
    const { platform: _platform, ...noPlatform } = session;
    expect(parseEvent(text(noPlatform))).toBeNull();
  });

  it('rejects bad session ids and versions', () => {
    for (const id of ['0123456789ABCDEF0123456789ABCDEF', 'abc', `${SESSION}0`, 42]) {
      expect(parseEvent(text({ ...end, session: id })), String(id)).toBeNull();
    }
    for (const version of ['dev', '2026-10-11', '2026-10-11.1<script>', '2026-10-11.123', 20261011]) {
      expect(parseEvent(text({ ...session, version })), String(version)).toBeNull();
    }
  });

  it('rejects values outside the allow-lists', () => {
    expect(parseEvent(text({ ...session, input: 'mouse' }))).toBeNull();
    expect(parseEvent(text({ ...session, orientation: 'square' }))).toBeNull();
    expect(parseEvent(text({ ...session, platform: 'windows' }))).toBeNull();
    expect(parseEvent(text({ ...session, kid: 'false' }))).toBeNull();
    expect(parseEvent(text({ ...run, kid: 0 }))).toBeNull();
  });

  it('rejects run values that are not bucket values', () => {
    for (const seconds of [5, 125, -10, 3610, 10.5, '120']) expect(parseEvent(text({ ...run, seconds })), `seconds ${seconds}`).toBeNull();
    for (const distance of [50, 1350, -100, 5100, 100.5]) expect(parseEvent(text({ ...run, distance })), `distance ${distance}`).toBeNull();
    for (const score of [1, 99, 1000, 10000, -100]) expect(parseEvent(text({ ...run, score })), `score ${score}`).toBeNull();
  });

  it('rejects end seconds that are not whole, negative or too large', () => {
    for (const seconds of [-1, 1.5, 4 * 3600 + 1, '10', null]) expect(parseEvent(text({ ...end, seconds })), String(seconds)).toBeNull();
  });
});
