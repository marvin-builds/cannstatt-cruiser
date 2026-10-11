import { describe, expect, it } from 'vitest';
import { FEEDBACK_TEXT, FeedbackFlow } from './feedback-flow';
import { entrySheetModel, feedbackSheetModel, SHEET_STYLE } from './portrait-sheets';

const flow = () => new FeedbackFlow({ send: () => Promise.resolve('sent' as const) });

describe('the portrait feedback sheet (ROADMAP 58)', () => {
  it('mirrors the form: kind, text, placeholder, log box, counter and the hint line', () => {
    const f = flow();
    f.openForm();
    f.setText('Hallo');
    const m = feedbackSheetModel(f);
    expect(m).toMatchObject({ done: false, kind: 'bug', text: 'Hallo', placeholder: 'Was ist passiert?', logShown: true, withLog: false, canSend: true, counter: f.counter });
    expect(m.line).toEqual({ text: 'Bitte keine persönlichen Daten.', message: false });
    f.setKind('idea');
    expect(feedbackSheetModel(f)).toMatchObject({ kind: 'idea', placeholder: 'Was wünschst du dir?', logShown: false });
  });

  it('shows a status message in place of the hint, and the thank-you once sent', async () => {
    const f = flow();
    f.openForm();
    await f.send({ platform: 'other', touch: true, portrait: true, viewWidth: 390, mode: 'title' });
    expect(feedbackSheetModel(f).line).toEqual({ text: FEEDBACK_TEXT.short, message: true });
    f.setText('Ein langer Fehlerbericht');
    await f.send({ platform: 'other', touch: true, portrait: true, viewWidth: 390, mode: 'title' });
    expect(feedbackSheetModel(f).done).toBe(true);
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
