/**
 * The highscore name entry as a full-screen portrait sheet (ROADMAP 58): the
 * headline, the run's points, "Dein Name:" with a big input, the status line,
 * "Als <Name> eintragen" and "Abbrechen". It shows what entrySheetModel says
 * and reports the player's actions; HighscoreFlow decides. Enter sends, Esc
 * cancels. DOM-only (sheet-dom.ts); index.ts uses the EntrySheet interface,
 * tests pass a fake.
 */
import { UI } from './art';
import { SCORE_TEXT } from './highscore-flow';
import { type EntrySheetModel, SHEET_STYLE } from './portrait-sheets';
import { NAME_MAX } from './score-rules';
import { buttonColour, createSheet, FIELD_STYLE, line, row, setText, sheetButton, styled, title } from './sheet-dom';

export interface EntrySheet {
  /** Shows the sheet with `model`, or hides it (and drops its focus) for null. Called every tick. */
  show(model: EntrySheetModel | null): void;
  /** Focuses the name input (opens the phone keyboard inside a user gesture). */
  focus(): void;
  blur(): void;
  /** The name input has the focus: a turn of the phone moves it to the other form. */
  isFocused(): boolean;
}

export interface EntrySheetHandlers {
  onInput(name: string): void;
  onSubmit(): void;
  onCancel(): void;
}

const CANCEL = 'Abbrechen';

export function createDomEntrySheet(handlers: EntrySheetHandlers): EntrySheet {
  let parts: ReturnType<typeof build> | null = null;

  function build() {
    const sheet = createSheet(SCORE_TEXT.entryTitle, () => handlers.onCancel());
    const score = line(SHEET_STYLE.titlePx - 4);
    const label = styled(document.createElement('label'), { display: 'flex', flexDirection: 'column', gap: '6px', color: UI.muted });
    const input = styled(document.createElement('input'), {
      ...FIELD_STYLE,
      minHeight: `${SHEET_STYLE.buttonPx}px`,
      color: UI.yellow,
      fontWeight: 'bold',
      fontSize: `${SHEET_STYLE.titlePx - 4}px`,
    });
    Object.assign(input, { type: 'text', maxLength: NAME_MAX, autocomplete: 'off', spellcheck: false, placeholder: 'Name', enterKeyHint: 'send' });
    input.setAttribute('autocapitalize', 'words');
    input.setAttribute('autocorrect', 'off');
    input.addEventListener('input', () => handlers.onInput(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      handlers.onSubmit();
    });
    label.append(SCORE_TEXT.namePrompt, input);
    const message = line(SHEET_STYLE.smallPx, UI.yellow);
    const submit = sheetButton(SCORE_TEXT.submit, () => handlers.onSubmit());
    const cancel = sheetButton(CANCEL, () => handlers.onCancel());
    sheet.root.append(row(title(SCORE_TEXT.entryTitle)), score, label, message, row(submit), row(cancel));
    return { sheet, score, input, message, submit };
  }

  return {
    show(model) {
      if (!model) {
        parts?.sheet.setShown(false);
        return;
      }
      parts ??= build();
      const p = parts;
      setText(p.score, model.score);
      if (p.input.value !== model.name) p.input.value = model.name;
      setText(p.message, model.message ?? '');
      setText(p.submit, model.submit);
      buttonColour(p.submit, model.canSubmit ? UI.yellow : UI.muted);
      p.sheet.setShown(true);
    },
    focus() {
      parts?.input.focus({ preventScroll: true });
    },
    blur() {
      parts?.input.blur();
    },
    isFocused() {
      return !!parts && document.activeElement === parts.input;
    },
  };
}
