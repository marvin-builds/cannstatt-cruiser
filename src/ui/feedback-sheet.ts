/**
 * The feedback form as a full-screen portrait sheet (ROADMAP 58): headline
 * with the character counter, the kind ("Fehler" / "Idee"), a tall textarea,
 * the privacy hint or status line, "Fehlerprotokoll mitsenden" (bug reports
 * only), "Abbrechen" / "Senden"; once sent the thank-you and "OK". It shows
 * what feedbackSheetModel says and reports the player's actions; the flow
 * (feedback-flow.ts) decides. Esc cancels. DOM-only (sheet-dom.ts); index.ts
 * uses the FeedbackSheet interface, tests pass a fake.
 */
import type { FeedbackKind } from '../net/feedback-types';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import { UI } from './art';
import { FEEDBACK_TEXT } from './feedback-flow';
import { type FeedbackSheetModel, SHEET_STYLE } from './portrait-sheets';
import { buttonColour, createSheet, FIELD_STYLE, line, row, setText, sheetButton, styled, title } from './sheet-dom';

export interface FeedbackSheet {
  /** Shows the sheet with `model`, or hides it (and drops its focus) for null. Called every tick. */
  show(model: FeedbackSheetModel | null): void;
  /** Focuses the text field (opens the phone keyboard inside a user gesture). */
  focus(): void;
  blur(): void;
  /** The text field has the focus (the keyboard is up): a turn of the phone moves it to the other form. */
  isFocused(): boolean;
}

export interface FeedbackSheetHandlers {
  onInput(text: string): void;
  onKind(kind: FeedbackKind): void;
  onToggleLog(): void;
  onSend(): void;
  /** "Abbrechen", "OK" after sending, and Esc. */
  onCancel(): void;
}

export function createDomFeedbackSheet(handlers: FeedbackSheetHandlers): FeedbackSheet {
  let parts: ReturnType<typeof build> | null = null;

  function build() {
    const sheet = createSheet(FEEDBACK_TEXT.title, () => handlers.onCancel());
    const counter = line(SHEET_STYLE.smallPx, UI.muted);
    const bug = sheetButton(FEEDBACK_TEXT.bug, () => handlers.onKind('bug'));
    const idea = sheetButton(FEEDBACK_TEXT.idea, () => handlers.onKind('idea'));
    const area = styled(document.createElement('textarea'), { ...FIELD_STYLE, flex: '1 1 auto', minHeight: '8em', resize: 'none' });
    Object.assign(area, { maxLength: MAX_FEEDBACK_TEXT, spellcheck: true });
    area.setAttribute('aria-label', 'Dein Feedback');
    area.setAttribute('autocomplete', 'off');
    area.addEventListener('input', () => handlers.onInput(area.value));
    const status = line(SHEET_STYLE.smallPx, UI.muted);
    const box = styled(document.createElement('input'), { width: '24px', height: '24px', margin: '0', accentColor: UI.yellow });
    box.type = 'checkbox';
    box.addEventListener('change', () => handlers.onToggleLog());
    const log = styled(document.createElement('label'), {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      minHeight: `${SHEET_STYLE.buttonPx}px`,
      fontSize: `${SHEET_STYLE.textPx}px`,
    });
    log.append(box, FEEDBACK_TEXT.log);
    const cancel = sheetButton(FEEDBACK_TEXT.cancel, () => handlers.onCancel());
    const send = sheetButton(FEEDBACK_TEXT.send, () => handlers.onSend());
    const form = [row(title(FEEDBACK_TEXT.title), counter), row(bug, idea), area, status, log, row(cancel, send)];
    const thanks = styled(line(SHEET_STYLE.titlePx, UI.yellow), { margin: 'auto 0 0', textAlign: 'center' });
    thanks.textContent = FEEDBACK_TEXT.sent;
    const ok = sheetButton(FEEDBACK_TEXT.ok, () => handlers.onCancel());
    const done = [thanks, styled(row(ok), { marginBottom: 'auto' })];
    sheet.root.append(...form, ...done);
    return { sheet, counter, bug, idea, area, status, box, log, send, form, done };
  }

  /** Shows `els` (display as given), or hides them. */
  const toggle = (els: HTMLElement[], shown: boolean, display: string) => {
    for (const el of els) if (el.style.display !== (shown ? display : 'none')) el.style.display = shown ? display : 'none';
  };

  return {
    show(model) {
      if (!model) {
        parts?.sheet.setShown(false);
        return;
      }
      parts ??= build();
      const p = parts;
      toggle(p.form.filter((el) => el !== p.area && el !== p.status && el !== p.log), !model.done, 'flex');
      toggle([p.area, p.status], !model.done, 'block');
      toggle([p.log], !model.done && model.logShown, 'flex');
      toggle(p.done, model.done, 'flex');
      setText(p.counter, model.counter);
      if (p.area.value !== model.text) p.area.value = model.text;
      if (p.area.placeholder !== model.placeholder) p.area.placeholder = model.placeholder;
      setText(p.status, model.line.text);
      buttonColour(p.status, model.line.message ? UI.yellow : UI.muted);
      for (const [el, kind] of [[p.bug, 'bug'], [p.idea, 'idea']] as const) {
        const chosen = model.kind === kind;
        buttonColour(el, chosen ? UI.yellow : UI.muted);
        el.style.borderBottom = `${chosen ? 4 : 2}px solid ${chosen ? UI.yellow : UI.buttonEdge}`;
        el.setAttribute('aria-pressed', String(chosen));
      }
      if (p.box.checked !== model.withLog) p.box.checked = model.withLog;
      buttonColour(p.log, model.withLog ? UI.white : UI.muted);
      buttonColour(p.send, model.canSend ? UI.yellow : UI.muted);
      p.sheet.setShown(true);
    },
    focus() {
      parts?.area.focus({ preventScroll: true });
    },
    blur() {
      parts?.area.blur();
    },
    isFocused() {
      return !!parts && document.activeElement === parts.area;
    },
  };
}
