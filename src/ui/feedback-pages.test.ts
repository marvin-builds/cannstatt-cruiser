import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import { type KeptReport, reportSignature } from '../net/feedback-reports';
import type { FeedbackBody } from '../net/feedback-types';
import { FEEDBACK_PAGE_TEXT, previewSections, reportDetail, reportRows, STATUS_LABEL } from './feedback-pages';

const BODY: FeedbackBody = {
  session: '0123456789abcdef0123456789abcdef',
  kind: 'bug',
  text: 'Der Skater bleibt am Bus hängen',
  version: '2026-10-11.10',
  platform: 'android',
  input: 'touch',
  orientation: 'landscape',
  viewWidth: 390,
  log: ['error: boom (index.js:1)', 'state: mode title, version 2026-10-11.10, view 390x180'],
  key: 'f'.repeat(32),
};

const report = (id: number, extra: Partial<KeptReport> = {}): KeptReport => {
  const { session: _session, ...sent } = BODY;
  const r = { ...sent, id, day: '2026-10-11', status: 'open', reply: null, doneVersion: null, ...extra } as KeptReport;
  return { ...r, seen: extra.seen ?? reportSignature(r) };
};

describe('"Das wird gesendet"', () => {
  it('lists the whole message: kind, text, version, device, the session id line, the log and what is not in it', () => {
    const sections = previewSections(BODY, { session: BODY.session, logAvailable: true });
    expect(sections.map((s) => s.label)).toEqual([
      'Art',
      'Text',
      'Spielversion',
      'Gerät',
      'Sitzungsnummer (nur gegen Spam, wird nicht gespeichert)',
      'Fehlerprotokoll',
      null,
    ]);
    expect(sections.map((s) => s.lines)).toEqual([
      ['Fehler'],
      [BODY.text],
      ['2026-10-11.10'],
      ['Android, Touch, quer, 390 px breit'],
      [BODY.session],
      BODY.log,
      ['Nicht dabei: Name, IP-Adresse, Geräte-ID, Highscores, deine Eingaben im Spiel.'],
    ]);
    expect(sections[5]!.log).toBe(true);
  });

  it('says when no errors were recorded or the box is not ticked; an idea has no log line', () => {
    const none = previewSections({ ...BODY, log: [] }, { session: BODY.session, logAvailable: false });
    expect(none.find((s) => s.label === 'Fehlerprotokoll')).toMatchObject({ lines: ['Keine Fehler aufgezeichnet'], log: false });
    const unticked = previewSections({ ...BODY, log: [] }, { session: BODY.session, logAvailable: true });
    expect(unticked.find((s) => s.label === 'Fehlerprotokoll')!.lines).toEqual(['Nicht angehakt, wird nicht gesendet']);
    const idea = previewSections({ ...BODY, kind: 'idea', log: [] }, { session: BODY.session, logAvailable: true });
    expect(idea.some((s) => s.label === 'Fehlerprotokoll')).toBe(false);
    expect(idea[0]!.lines).toEqual(['Idee']);
  });

  it('a sent report shows no session id (it was never kept) and an empty log as not sent', () => {
    const sections = previewSections({ ...report(1), log: [] }, { session: null, logAvailable: true });
    expect(sections.some((s) => s.label?.startsWith('Sitzungsnummer'))).toBe(false);
    expect(sections.find((s) => s.label === 'Fehlerprotokoll')!.lines).toEqual(['Nicht mitgesendet']);
  });

  it('on a test device says that the tester pass goes with it, without showing the pass', () => {
    const pass = 'tester.v1.1790000000000.secretsignature';
    const sections = previewSections({ ...BODY, testerPass: pass }, { session: BODY.session, logAvailable: true });
    const tester = sections.find((s) => s.label === FEEDBACK_PAGE_TEXT.testerPass);
    expect(tester?.lines).toEqual([FEEDBACK_PAGE_TEXT.testerPassSent]);
    expect(sections.indexOf(tester!)).toBe(sections.length - 2);
    expect(JSON.stringify(sections)).not.toContain('secretsignature');
    expect(previewSections(BODY, { session: BODY.session, logAvailable: true }).some((s) => s.label === FEEDBACK_PAGE_TEXT.testerPass)).toBe(false);
  });

  it('names the device in German words', () => {
    const device = (b: Partial<FeedbackBody>) => previewSections({ ...BODY, ...b }, { session: null, logAvailable: true })[3]!.lines[0];
    expect(device({ platform: 'ios', input: 'keys', orientation: 'portrait', viewWidth: 320 })).toBe('iPhone/iPad, Tastatur, hochkant, 320 px breit');
    expect(device({ platform: 'other' })).toBe('Computer/anderes, Touch, quer, 390 px breit');
  });
});

describe('"Mein Feedback" list', () => {
  it('names every status as the player reads it', () => {
    expect(STATUS_LABEL).toEqual({ open: 'Offen', todo: 'Geplant', done: 'Umgesetzt', rejected: 'Nicht geplant', removed: 'Entfernt' });
  });

  it('a row per report in the given order: status, kind, date, the start of the text, a dot on marked ones, the fresh one highlighted', () => {
    const rows = reportRows([report(5, { status: 'done', kind: 'idea', text: 'Mehr Brezeln\nund Musik' }), report(3)], [5], 3);
    expect(rows).toEqual([
      { id: 5, status: 'done', label: 'Umgesetzt', kind: 'Idee', day: '11.10.2026', text: 'Mehr Brezeln und Musik', changed: true, fresh: false },
      { id: 3, status: 'open', label: 'Offen', kind: 'Fehler', day: '11.10.2026', text: BODY.text, changed: false, fresh: true },
    ]);
    expect(reportRows([report(3)], [], null)[0]!.fresh).toBe(false);
  });

  it('says so when nothing was sent from this device', () => {
    expect(FEEDBACK_PAGE_TEXT.empty).toBe('Noch kein Feedback von diesem Gerät');
    expect(measureText(FEEDBACK_PAGE_TEXT.empty)).toBeLessThanOrEqual(320 - 16);
  });
});

describe('report details', () => {
  it('status with the version, the reply, the full text and what was sent with it', () => {
    const d = reportDetail(report(5, { status: 'done', doneVersion: '2026-10-12.1', reply: 'Danke, ist drin!' }));
    expect(d).toEqual({
      status: 'done',
      headline: 'Umgesetzt in Version 2026-10-12.1',
      reply: 'Antwort: „Danke, ist drin!“',
      text: BODY.text,
      sent: 'Gesendet am 11.10.2026 mit: Fehler, Version 2026-10-11.10, Android, Touch, quer, 390 px breit, Fehlerprotokoll (2 Zeilen)',
    });
  });

  it('without a reply or version, and an idea without a log', () => {
    const d = reportDetail(report(3, { status: 'rejected', kind: 'idea', log: [] }));
    expect(d.headline).toBe('Nicht geplant');
    expect(d.reply).toBeNull();
    expect(d.sent).toBe('Gesendet am 11.10.2026 mit: Idee, Version 2026-10-11.10, Android, Touch, quer, 390 px breit');
    expect(reportDetail(report(4, { log: [] })).sent).toContain('ohne Fehlerprotokoll');
  });
});
