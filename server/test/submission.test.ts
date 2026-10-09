import { describe, expect, it } from 'vitest';
import { parseSubmission } from '../src/submission';

const valid = { name: '  Flinker  Fuchs ', score: 28507, distance: 4069, duration: 300, version: '2026-10-08.3', device: 'a1b2c3d4-e5f6' };

describe('parseSubmission', () => {
  it('returns the cleaned submission', () => {
    expect(parseSubmission(valid)).toEqual({ ok: true, value: { ...valid, name: 'Flinker Fuchs' } });
  });

  it('rejects a broken body as bad-request', () => {
    for (const body of [null, 'x', [], { ...valid, score: '1' }, { ...valid, distance: 1.5 }, { ...valid, duration: Number.NaN }, { ...valid, version: '' }, { ...valid, version: 'x'.repeat(33) }, { ...valid, version: '<b>' }]) {
      expect(parseSubmission(body), JSON.stringify(body)).toEqual({ ok: false, error: 'bad-request' });
    }
  });

  it('checks the device id: 8-64 chars of letters, digits and -', () => {
    expect(parseSubmission({ ...valid, device: 'abcdefgh' }).ok).toBe(true);
    expect(parseSubmission({ ...valid, device: 'A'.repeat(64) }).ok).toBe(true);
    for (const device of ['abcdefg', 'A'.repeat(65), 'abc_defgh', undefined]) {
      expect(parseSubmission({ ...valid, device })).toEqual({ ok: false, error: 'bad-request' });
    }
  });

  it('rejects bad or offensive names as name', () => {
    expect(parseSubmission({ ...valid, name: 'X' })).toEqual({ ok: false, error: 'name' });
    expect(parseSubmission({ ...valid, name: 'F u c k' })).toEqual({ ok: false, error: 'name' });
    expect(parseSubmission({ ...valid, name: 42 })).toEqual({ ok: false, error: 'name' });
  });

  it('rejects implausible runs and negative numbers as implausible', () => {
    expect(parseSubmission({ ...valid, score: 9_999_999 })).toEqual({ ok: false, error: 'implausible' });
    expect(parseSubmission({ ...valid, score: -5 })).toEqual({ ok: false, error: 'implausible' });
    expect(parseSubmission({ ...valid, duration: 0 })).toEqual({ ok: false, error: 'implausible' });
  });
});
