import { describe, expect, it } from 'vitest';
import type { KeptReport } from '../net/feedback-reports';
import type { FeedbackBody } from '../net/feedback-types';
import { FEEDBACK_TEXT, FeedbackFlow } from './feedback-flow';
import { entrySheetModel, feedbackSheetModel, SHEET_STYLE } from './portrait-sheets';

const BODY: FeedbackBody = {
  session: 's'.repeat(32),
  kind: 'bug',
  text: 'Hängt',
  version: '2026-10-11.10',
  platform: 'other',
  input: 'touch',
  orientation: 'portrait',
  viewWidth: 390,
  log: ['error: x (a.js:1)'],
  key: 'k'.repeat(32),
};
const sender = { hasLog: true, prepare: (): FeedbackBody => ({ ...BODY }), send: () => Promise.resolve('sent' as const) };
const report = (): KeptReport => {
  const { session: _session, ...sent } = BODY;
  return { ...sent, id: 4, day: '2026-10-11', status: 'done', reply: 'Danke!', doneVersion: '2026-10-12.1', seen: 'old' };
};
const inbox = (reports: KeptReport[]) => {
  let seen = false;
  return {
    reports,
    get changed() {
      return !seen && reports.length > 0;
    },
    changedIds: () => (seen ? [] : reports.map((r) => r.id)),
    markSeen: () => void (seen = true),
    checkIfDue: () => Promise.resolve(),
    remove: () => Promise.resolve('deleted' as const),
  };
};
const flow = (reports: KeptReport[] = []) => new FeedbackFlow(sender, inbox(reports));
const CONTEXT = { platform: 'other', touch: true, portrait: true, viewWidth: 390, mode: 'title' } as const;

describe('the portrait feedback sheet (ROADMAP 58)', () => {
  it('mirrors the form: kind, text, placeholder, log box, counter and the hint line', () => {
    const f = flow();
    f.openForm();
    f.setText('Hallo');
    const m = feedbackSheetModel(f);
    expect(m).toMatchObject({ tab: 'new', page: 'form', note: null, kind: 'bug', text: 'Hallo', placeholder: 'Was ist passiert?', logShown: true, logAvailable: true, withLog: false, canSend: true, counter: f.counter });
    expect(m.line).toEqual({ text: 'Bitte keine persönlichen Daten.', message: false });
    f.setKind('idea');
    expect(feedbackSheetModel(f)).toMatchObject({ kind: 'idea', placeholder: 'Was wünschst du dir?', logShown: false });
  });

  it('shows a status message in place of the hint, and once sent the thanks over "Mein Feedback" (ROADMAP 75)', async () => {
    const f = flow();
    f.openForm();
    await f.send(CONTEXT);
    expect(feedbackSheetModel(f).line).toEqual({ text: FEEDBACK_TEXT.short, message: true });
    f.setText('Ein langer Fehlerbericht');
    await f.send(CONTEXT);
    expect(feedbackSheetModel(f)).toMatchObject({ tab: 'mine', page: 'list', note: FEEDBACK_TEXT.sent, line: { text: FEEDBACK_TEXT.sent, message: true } });
    f.showTab('new');
    expect(feedbackSheetModel(f).note).toBeNull();
  });

  it('carries the tabs, the dot and the pages of ROADMAP 70', () => {
    const f = flow([report()]);
    f.openForm();
    expect(feedbackSheetModel(f)).toMatchObject({ tab: 'new', dot: true, title: null, rows: [], sections: [], detail: null });
    f.setText('Hallo');
    f.openPreview(CONTEXT);
    const preview = feedbackSheetModel(f);
    expect(preview).toMatchObject({ page: 'preview', title: 'Das wird gesendet' });
    expect(preview.sections.map((s) => s.label)).toContain('Fehlerprotokoll');
    f.showTab('mine');
    const list = feedbackSheetModel(f);
    expect(list).toMatchObject({ tab: 'mine', page: 'list', dot: false });
    expect(list.rows).toEqual([expect.objectContaining({ id: 4, label: 'Umgesetzt', changed: true })]);
    f.openReport(4);
    expect(feedbackSheetModel(f).detail).toMatchObject({ headline: 'Umgesetzt in Version 2026-10-12.1', reply: 'Antwort: „Danke!“' });
    f.openSentLog();
    expect(feedbackSheetModel(f)).toMatchObject({ page: 'sent', title: 'Das wurde gesendet' });
  });
});

describe('the portrait name entry sheet (ROADMAP 58)', () => {
  it('shows the points, the name and the submit label of the canvas entry', () => {
    const m = entrySheetModel({ score: 12345, name: 'Rollo', canSubmit: true, sending: false, message: null });
    expect(m).toEqual({ score: '12.345 Punkte', name: 'Rollo', submit: 'Als Rollo eintragen', canSubmit: true, message: null });
    expect(entrySheetModel({ score: 5, name: '', canSubmit: false, sending: false, message: 'Mindestens 2 Zeichen' })).toMatchObject({
      submit: 'Eintragen',
      canSubmit: false,
      message: 'Mindestens 2 Zeichen',
    });
  });
});

describe('sheet sizes', () => {
  it('reads big and taps easily: text at least 16 CSS px, buttons at least 48', () => {
    expect(SHEET_STYLE.textPx).toBeGreaterThanOrEqual(16);
    expect(SHEET_STYLE.smallPx).toBeGreaterThanOrEqual(16);
    expect(SHEET_STYLE.buttonPx).toBeGreaterThanOrEqual(48);
  });
});
