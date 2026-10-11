import { describe, expect, it } from 'vitest';
import { parseFeedbackId, parseIssueDraft, parseTriagePatch } from '../src/feedback-triage-parse';
import { MAX_ISSUE_BODY, MAX_ISSUE_TITLE, MAX_REPLY_CHARS } from '../src/feedback-triage-rules';

describe('parseFeedbackId', () => {
  it('accepts positive integers in plain decimal', () => {
    expect(parseFeedbackId('1')).toBe(1);
    expect(parseFeedbackId('4711')).toBe(4711);
  });
  it('rejects zero, signs, leading zeros, fractions, huge numbers and words', () => {
    for (const raw of ['0', '-1', '+1', '01', '1.5', '1e3', '9007199254740993', '', 'abc', ' 1']) expect(parseFeedbackId(raw), raw).toBeNull();
  });
});

describe('parseIssueDraft', () => {
  it('trims the title to one line and the body, keeping line breaks and tabs in the body', () => {
    expect(parseIssueDraft(JSON.stringify({ title: '  Fehler:   Skater\nhängt ', body: '\r\n> Text\r\n\n\tlog\n' }))).toEqual({
      title: 'Fehler: Skater hängt',
      body: '> Text\n\n\tlog',
    });
  });
  it('enforces the lengths', () => {
    expect(parseIssueDraft(JSON.stringify({ title: 'x'.repeat(MAX_ISSUE_TITLE), body: 'y'.repeat(MAX_ISSUE_BODY) }))).not.toBeNull();
    expect(parseIssueDraft(JSON.stringify({ title: 'x'.repeat(MAX_ISSUE_TITLE + 1), body: 'y' }))).toBeNull();
    expect(parseIssueDraft(JSON.stringify({ title: 'Titel', body: 'y'.repeat(MAX_ISSUE_BODY + 1) }))).toBeNull();
    expect(parseIssueDraft(JSON.stringify({ title: 'ab', body: 'y' }))).toBeNull();
    expect(parseIssueDraft(JSON.stringify({ title: 'Titel', body: '   ' }))).toBeNull();
  });
  it('rejects control characters, other shapes and extra fields', () => {
    for (const value of [
      { title: 'Ti\u0000tel', body: 'b' }, { title: 'Titel', body: 'b\u0007' }, { title: 'Titel' }, { title: 1, body: 'b' },
      { title: 'Titel', body: 'b', labels: [] }, null, [], 'Titel',
    ]) expect(parseIssueDraft(JSON.stringify(value)), JSON.stringify(value)).toBeNull();
    expect(parseIssueDraft('{')).toBeNull();
  });
});

describe('parseTriagePatch', () => {
  it('takes a status, a reply or both', () => {
    expect(parseTriagePatch('{"status":"done"}')).toEqual({ status: 'done' });
    expect(parseTriagePatch('{"reply":" Danke! "}')).toEqual({ reply: 'Danke!' });
    expect(parseTriagePatch('{"status":"rejected","reply":"Zu schwer"}')).toEqual({ status: 'rejected', reply: 'Zu schwer' });
  });
  it('turns an empty or null reply into null (clears it)', () => {
    expect(parseTriagePatch('{"reply":"  "}')).toEqual({ reply: null });
    expect(parseTriagePatch('{"reply":null}')).toEqual({ reply: null });
  });
  it('caps the reply and keeps it to one line', () => {
    expect(parseTriagePatch(JSON.stringify({ reply: 'x'.repeat(MAX_REPLY_CHARS) }))).not.toBeNull();
    expect(parseTriagePatch(JSON.stringify({ reply: 'x'.repeat(MAX_REPLY_CHARS + 1) }))).toBeNull();
    expect(parseTriagePatch(JSON.stringify({ reply: 'a\nb' }))).toBeNull();
  });
  it('rejects unknown statuses, unknown fields and an empty patch', () => {
    for (const json of ['{"status":"later"}', '{"status":null}', '{"issue":1}', '{}', '[]', 'null', '{"reply":3}', 'x']) {
      expect(parseTriagePatch(json), json).toBeNull();
    }
  });
});
