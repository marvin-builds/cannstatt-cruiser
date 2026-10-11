import { describe, expect, it } from 'vitest';
import { normaliseFeedbackText, parseFeedback } from '../src/feedback-parse';
import { MAX_FEEDBACK_TEXT, MAX_LOG_LINE_CHARS, MAX_LOG_LINES, MAX_VIEW_WIDTH, MIN_FEEDBACK_TEXT, MIN_VIEW_WIDTH } from '../src/feedback-rules';

const SESSION = '0123456789abcdef0123456789abcdef';
const valid = {
  session: SESSION, kind: 'bug', text: 'Der Skater bleibt hängen', version: '2026-10-11.4', platform: 'android',
  input: 'touch', orientation: 'portrait', viewWidth: 360, log: ['TypeError: x is undefined'],
};
const parse = (body: unknown) => parseFeedback(JSON.stringify(body));

describe('parseFeedback', () => {
  it('accepts a valid bug report and an idea without log', () => {
    expect(parse(valid)).toEqual(valid);
    expect(parse({ ...valid, kind: 'idea', log: [] })).toEqual({ ...valid, kind: 'idea', log: [] });
  });

  it('rejects non-JSON, arrays and null', () => {
    expect(parseFeedback('nope')).toBeNull();
    expect(parse([valid])).toBeNull();
    expect(parse(null)).toBeNull();
  });

  it('rejects unknown and missing fields', () => {
    expect(parse({ ...valid, name: 'Max' })).toBeNull();
    const { log: _log, ...withoutLog } = valid;
    expect(parse(withoutLog)).toBeNull();
  });

  it('rejects a bad kind, session, version or allow-list value', () => {
    expect(parse({ ...valid, kind: 'praise' })).toBeNull();
    expect(parse({ ...valid, session: 'ABC' })).toBeNull();
    expect(parse({ ...valid, version: '1.0' })).toBeNull();
    expect(parse({ ...valid, platform: 'windows' })).toBeNull();
    expect(parse({ ...valid, input: 'mouse' })).toBeNull();
    expect(parse({ ...valid, orientation: 'square' })).toBeNull();
  });

  it('accepts only an integer view width in range', () => {
    expect(parse({ ...valid, viewWidth: MIN_VIEW_WIDTH })).not.toBeNull();
    expect(parse({ ...valid, viewWidth: MAX_VIEW_WIDTH })).not.toBeNull();
    expect(parse({ ...valid, viewWidth: MIN_VIEW_WIDTH - 1 })).toBeNull();
    expect(parse({ ...valid, viewWidth: MAX_VIEW_WIDTH + 1 })).toBeNull();
    expect(parse({ ...valid, viewWidth: 360.5 })).toBeNull();
    expect(parse({ ...valid, viewWidth: '360' })).toBeNull();
  });

  it('checks the text length after trimming', () => {
    expect(parse({ ...valid, text: `  ${'a'.repeat(MIN_FEEDBACK_TEXT)}  ` })?.text).toBe('a'.repeat(MIN_FEEDBACK_TEXT));
    expect(parse({ ...valid, text: `   ${'a'.repeat(MIN_FEEDBACK_TEXT - 1)}   ` })).toBeNull();
    expect(parse({ ...valid, text: 'a'.repeat(MAX_FEEDBACK_TEXT) })).not.toBeNull();
    expect(parse({ ...valid, text: 'a'.repeat(MAX_FEEDBACK_TEXT + 1) })).toBeNull();
    expect(parse({ ...valid, text: 42 })).toBeNull();
  });

  it('rejects control characters in the text except newline', () => {
    expect(parse({ ...valid, text: 'Zeile 1\nZeile 2' })?.text).toBe('Zeile 1\nZeile 2');
    expect(parse({ ...valid, text: 'Zeile 1\r\nZeile 2' })?.text).toBe('Zeile 1\nZeile 2');
    expect(parse({ ...valid, text: 'Tab\there' })).toBeNull();
    expect(parse({ ...valid, text: 'Null\u0000byte' })).toBeNull();
    expect(parse({ ...valid, text: 'Esc\u001b[31m' })).toBeNull();
    expect(parse({ ...valid, text: 'C1\u0085x' })).toBeNull();
  });

  it('accepts a log of at most MAX_LOG_LINES strings of at most MAX_LOG_LINE_CHARS', () => {
    expect(parse({ ...valid, log: Array(MAX_LOG_LINES).fill('x'.repeat(MAX_LOG_LINE_CHARS)) })).not.toBeNull();
    expect(parse({ ...valid, log: Array(MAX_LOG_LINES + 1).fill('x') })).toBeNull();
    expect(parse({ ...valid, log: ['x'.repeat(MAX_LOG_LINE_CHARS + 1)] })).toBeNull();
    expect(parse({ ...valid, log: [1] })).toBeNull();
    expect(parse({ ...valid, log: 'x' })).toBeNull();
    expect(parse({ ...valid, log: ['two\nlines'] })).toBeNull();
  });

  it('accepts a log only on a bug report', () => {
    expect(parse({ ...valid, kind: 'idea' })).toBeNull();
  });
});

describe('normaliseFeedbackText', () => {
  it('trims and collapses more than two blank lines into two', () => {
    expect(normaliseFeedbackText('  a\n\n\n\n\n\nb  ')).toBe('a\n\n\nb');
    expect(normaliseFeedbackText('a\n\n\nb')).toBe('a\n\n\nb');
    expect(normaliseFeedbackText('a\n\nb')).toBe('a\n\nb');
    expect(normaliseFeedbackText('a\r\n\r\n\r\n\r\nb')).toBe('a\n\n\nb');
  });
});
