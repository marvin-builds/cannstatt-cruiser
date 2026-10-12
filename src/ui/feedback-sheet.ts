/**
 * The feedback dialog as a full-screen portrait sheet (ROADMAP 58, 70). The
 * top row holds the tabs "Neu" / "Mein Feedback" (with the red dot) and "×",
 * or on a sub-page "Zurück" with its headline (a report's details: "Ansehen",
 * and "Löschen" under the panel, which asks "Wirklich löschen?" with
 * "Abbrechen" / "Ja, löschen", ROADMAP 78).
 * "Neu": the kind ("Fehler" / "Idee"), a tall textarea, the privacy hint or
 * status line with the counter, "Fehlerprotokoll mitsenden" (bug reports
 * only, disabled while nothing was recorded) with "Ansehen", and "Senden";
 * once sent "Mein Feedback" with the thanks over it and the new report
 * framed on top (ROADMAP 75), after a delete with "Feedback gelöscht". "Das wird gesendet", "Mein Feedback" and a
 * report's details scroll natively in a panel with a scroll bar, and by the
 * scroll keys (arrows, W / S, Page Up / Down, Home, End). It shows what
 * feedbackSheetModel says and reports the player's actions; the flow
 * (feedback-flow.ts) decides. Esc goes back a page or closes. DOM-only
 * (sheet-dom.ts); feedback-dialog.ts uses the FeedbackSheet interface, tests
 * pass a fake.
 */
import type { FeedbackKind } from '../net/feedback-types';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import { UI } from './art';
import type { FeedbackTab } from './feedback-flow';
import { confirmItems, type TextTone } from './feedback-page-layout';
import { texts } from './i18n';
import { type PageSection, type ReportDetail, type ReportRow, STATUS_COLOR } from './feedback-pages';
import { type FeedbackSheetModel, SHEET_STYLE } from './portrait-sheets';
import { sheetScrollTo } from './whats-new';
import { buttonColour, createSheet, FIELD_STYLE, line, row, scrollPanel, setText, SheetParts, sheetButton, styled, title } from './sheet-dom';

export interface FeedbackSheet {
  /** Shows the sheet with `model`, or hides it (and drops its focus) for null. Called every tick. */
  show(model: FeedbackSheetModel | null): void;
  /** Focuses the text field (opens the phone keyboard inside a user gesture). */
  focus(): void;
  blur(): void;
  /** The text field has the focus (the keyboard is up): a turn of the phone moves it to the other form. */
  isFocused(): boolean;
  /** Scrolls a list or text page for scroll key `code` and returns true; false for other keys or on the form. */
  scrollKey(code: string): boolean;
}

export interface FeedbackSheetHandlers {
  onInput(text: string): void;
  onKind(kind: FeedbackKind): void;
  onToggleLog(): void;
  onSend(): void;
  /** "Ansehen" on the form. */
  onPreview(): void;
  onTab(tab: FeedbackTab): void;
  /** A row of "Mein Feedback". */
  onOpenReport(id: number): void;
  /** "Ansehen" on a report's details. */
  onSentLog(): void;
  /** "Löschen" on a report's details: asks first. */
  onDelete(): void;
  /** "Ja, löschen". */
  onConfirmDelete(): void;
  /** "Zurück" and Esc: the page before, else closes. */
  onBack(): void;
  /** "×". */
  onClose(): void;
}

/** The red dot (ROADMAP 70) after a label. */
function dot(): HTMLSpanElement {
  const el = styled(document.createElement('span'), {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    marginLeft: '6px',
    borderRadius: '50%',
    background: UI.red,
    verticalAlign: 'middle',
  });
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** A tab button: the chosen one yellow and underlined. */
function choose(el: HTMLElement, chosen: boolean): void {
  buttonColour(el, chosen ? UI.yellow : UI.muted);
  el.style.borderBottom = `${chosen ? 4 : 2}px solid ${chosen ? UI.yellow : UI.buttonEdge}`;
  el.setAttribute('aria-pressed', String(chosen));
}

const TONE_COLOUR: Partial<Record<TextTone, string>> = { message: UI.yellow, text: UI.white, muted: UI.muted };

const BLOCK_STYLE: Partial<CSSStyleDeclaration> = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0 0 4px' };

/** A game version ("2026-10-12.3"): it wraps as a whole, never at its hyphens. */
const VERSION = /(\d{4}-\d{2}-\d{2}\.\d+)/;

/** Sets `text` on `el`, with every game version in it kept on one line. */
function blockText(el: HTMLElement, text: string): void {
  el.replaceChildren(
    ...text.split(VERSION).map((part, i) => (i % 2 === 0 ? document.createTextNode(part) : styled(Object.assign(document.createElement('span'), { textContent: part }), { whiteSpace: 'nowrap' }))),
  );
}

/** Label size of buttons that share a row tightly (the tabs, the confirm's): smaller on the narrowest phones, so they stay on one line. */
const NARROW_FONT = `min(${SHEET_STYLE.textPx}px, 5vw)`;
const NARROW_BUTTON: Partial<CSSStyleDeclaration> = { padding: '0 8px', whiteSpace: 'nowrap', fontSize: NARROW_FONT };

/** "Das wird gesendet" / "Das wurde gesendet": labels over their lines, the log lines small and muted. */
function fillSections(list: HTMLElement, sections: readonly PageSection[]): void {
  for (const s of sections) {
    if (s.label) {
      const label = styled(line(SHEET_STYLE.smallPx, UI.teal), { margin: '12px 0 2px', fontWeight: 'bold' });
      label.textContent = s.label;
      list.append(label);
    }
    for (const text of s.lines) {
      const el = styled(line(s.log ? SHEET_STYLE.smallPx : SHEET_STYLE.textPx, s.log || !s.label ? UI.muted : UI.white), BLOCK_STYLE);
      if (!s.label) el.style.marginTop = '12px';
      blockText(el, text);
      list.append(el);
    }
  }
}

/** "Mein Feedback": a button per report (status in its colour, kind, date, the start of the text, a dot when changed, a frame when just sent), or the empty note. */
function fillRows(list: HTMLElement, rows: readonly ReportRow[], open: (id: number) => void): void {
  if (rows.length === 0) {
    const empty = styled(line(SHEET_STYLE.textPx, UI.muted), { margin: '24px 0', textAlign: 'center' });
    empty.textContent = texts().feedbackPages.empty;
    list.append(empty);
    return;
  }
  for (const r of rows) {
    const button = sheetButton('', () => open(r.id));
    styled(button, { display: 'block', width: '100%', textAlign: 'left', margin: '0 0 8px', padding: '6px 8px', fontWeight: 'normal' });
    // The report just sent (ROADMAP 75) is framed in yellow.
    if (r.fresh) styled(button, { borderColor: UI.yellow, borderWidth: '3px' });
    const head = styled(document.createElement('div'), { fontWeight: 'bold', color: STATUS_COLOR[r.status] });
    head.textContent = r.label;
    if (r.changed) head.append(dot());
    const meta = styled(line(SHEET_STYLE.smallPx, UI.muted), {});
    meta.textContent = `${r.kind}, ${r.day}`;
    const text = styled(document.createElement('div'), { color: UI.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    text.textContent = r.text;
    button.replaceChildren(head, meta, text);
    list.append(button);
  }
}

/** A report's details: the status headline in its colour, the reply, the text, what it was sent with. */
function fillDetail(list: HTMLElement, d: ReportDetail): void {
  const block = (text: string, colour: string, size: number = SHEET_STYLE.textPx) => {
    const el = styled(line(size, colour), { ...BLOCK_STYLE, margin: '10px 0 0' });
    blockText(el, text);
    list.append(el);
    return el;
  };
  block(d.headline, STATUS_COLOR[d.status]).style.fontWeight = 'bold';
  if (d.reply) block(d.reply, UI.white);
  block(d.text, UI.white);
  block(d.sent, UI.muted, SHEET_STYLE.smallPx);
}

/** "Wirklich löschen?": the delete's status (deleting, or why it failed), what deleting means, the report's text. */
function fillConfirm(list: HTMLElement, d: ReportDetail, message: string | null): void {
  for (const item of confirmItems(d, message)) {
    if (item.tone === 'space') continue;
    const el = styled(line(SHEET_STYLE.textPx, TONE_COLOUR[item.tone] ?? UI.white), { ...BLOCK_STYLE, margin: '10px 0 0' });
    if (item.tone === 'message') el.setAttribute('role', 'status');
    blockText(el, item.text);
    list.append(el);
  }
}

export function createDomFeedbackSheet(handlers: FeedbackSheetHandlers): FeedbackSheet {
  const parts = new SheetParts(build);
  /** What the scrolling panel shows now (it is rebuilt only when this changes). */
  let pageKey = '';
  /** A list or text page shows (the scroll keys move it). */
  let panelShown = false;

  /** The scroll keys on a list or text page: a line, a page or to an end (whats-new.ts: sheetScrollTo). */
  function scrollKey(code: string): boolean {
    if (!parts.built || !panelShown) return false;
    const { list } = parts.built.panel;
    const lineH = parseFloat(getComputedStyle(list).lineHeight) || SHEET_STYLE.textPx;
    const to = sheetScrollTo(code, list.scrollTop, { max: list.scrollHeight - list.clientHeight, line: 2 * lineH, page: list.clientHeight });
    if (to === null) return false;
    list.scrollTop = to;
    return true;
  }

  function build() {
    const t = texts().feedback;
    const pages = texts().feedbackPages;
    // A new build (another language) fills its panel afresh.
    pageKey = '';
    const sheet = createSheet(t.title, () => handlers.onBack());
    sheet.root.style.overflowY = 'hidden';
    // Keys stop at the sheet while a button in it has the focus: it scrolls its page itself.
    sheet.root.addEventListener('keydown', (e) => {
      if (e.target !== area && scrollKey(e.code)) e.preventDefault();
    });
    const newTab = sheetButton(pages.newTab, () => handlers.onTab('new'));
    const mineTab = sheetButton(pages.mineTab, () => handlers.onTab('mine'));
    const mineDot = dot();
    mineTab.append(mineDot);
    for (const tab of [newTab, mineTab]) styled(tab, NARROW_BUTTON);
    styled(newTab, { flex: '0 0 auto' });
    styled(mineTab, { flex: '1 1 auto' });
    const close = sheetButton('×', () => handlers.onClose());
    close.setAttribute('aria-label', t.close);
    styled(close, { flex: '0 0 auto' });
    const tabs = styled(row(newTab, mineTab, close), { gap: '6px' });
    const back = sheetButton(pages.back, () => handlers.onBack());
    styled(back, { flex: '0 0 auto' });
    const heading = styled(title(''), { fontSize: `${SHEET_STYLE.textPx + 2}px` });
    const sentView = sheetButton(pages.view, () => handlers.onSentLog());
    styled(sentView, { flex: '0 0 auto' });
    const subHeader = row(back, heading, sentView);

    const bug = sheetButton(t.bug, () => handlers.onKind('bug'));
    const idea = sheetButton(t.idea, () => handlers.onKind('idea'));
    const area = styled(document.createElement('textarea'), { ...FIELD_STYLE, flex: '1 1 auto', minHeight: '6em', resize: 'none' });
    Object.assign(area, { maxLength: MAX_FEEDBACK_TEXT, spellcheck: true });
    area.setAttribute('aria-label', t.fieldAria);
    area.setAttribute('autocomplete', 'off');
    area.addEventListener('input', () => handlers.onInput(area.value));
    const status = styled(line(SHEET_STYLE.smallPx, UI.muted), { flex: '1 1 auto' });
    const counter = line(SHEET_STYLE.smallPx, UI.muted);
    const box = styled(document.createElement('input'), { width: '24px', height: '24px', margin: '0', accentColor: UI.yellow });
    box.type = 'checkbox';
    box.addEventListener('change', () => handlers.onToggleLog());
    const log = styled(document.createElement('label'), {
      display: 'flex',
      flex: '1 1 auto',
      minWidth: '0',
      alignItems: 'center',
      gap: '8px',
      minHeight: `${SHEET_STYLE.buttonPx}px`,
      fontSize: `${SHEET_STYLE.smallPx}px`,
    });
    log.append(box, t.log);
    const view = sheetButton(pages.view, () => handlers.onPreview());
    // 320 px phones: "Fehlerprotokoll mitsenden" and "Ansehen" share the row within the gutters.
    styled(view, { flex: '0 0 auto', padding: '0 8px' });
    const send = sheetButton(t.send, () => handlers.onSend());
    const logRow = row(log, view);
    const form = [row(bug, idea), area, row(status, counter), logRow, row(send)];
    const note = styled(line(SHEET_STYLE.textPx + 2, UI.yellow), { textAlign: 'center', fontWeight: 'bold' });
    note.setAttribute('role', 'status');
    const panel = scrollPanel(t.title);
    // Narrow phones: the rows and texts get the width, the scroll bar keeps its room at the right. The list
    // fills the frame as a flex child, so a frame sized to its content (the confirm) still scrolls when it must shrink.
    styled(panel.list, { padding: '4px 18px 8px 8px', height: 'auto', flex: '1 1 auto', minHeight: '0' });
    styled(panel.frame, { flexDirection: 'column' });
    const del = sheetButton(pages.delete, () => handlers.onDelete());
    styled(del, { flex: '0 0 auto' });
    const delRow = row(del);
    const no = sheetButton(pages.cancel, () => handlers.onBack());
    const yes = sheetButton(pages.confirmYes, () => handlers.onConfirmDelete());
    for (const b of [no, yes]) styled(b, NARROW_BUTTON);
    const confirmRow = row(no, yes);
    // "Wirklich löschen?" heads its own block (question, what deleting means, the buttons) instead of the top row.
    const question = styled(title(pages.confirmTitle), { flex: '0 0 auto', textAlign: 'center' });
    sheet.root.append(tabs, subHeader, ...form, note, question, panel.frame, delRow, confirmRow);
    return { sheet, newTab, mineTab, mineDot, tabs, subHeader, heading, sentView, bug, idea, area, status, counter, box, log, logRow, send, form, note, question, panel, del, delRow, no, yes, confirmRow };
  }

  /** Shows `els` (display as given), or hides them. */
  const toggle = (els: HTMLElement[], shown: boolean, display = 'flex') => {
    for (const el of els) if (el.style.display !== (shown ? display : 'none')) el.style.display = shown ? display : 'none';
  };

  /** The scrolling panel's content for a list or text page, rebuilt when it changes. */
  function fillPanel(p: ReturnType<typeof build>, model: FeedbackSheetModel): void {
    const key = JSON.stringify([model.page, model.rows, model.sections, model.detail, model.deleteMessage]);
    if (key === pageKey) return;
    pageKey = key;
    const { list } = p.panel;
    list.replaceChildren();
    if (model.page === 'list') fillRows(list, model.rows, handlers.onOpenReport);
    else if (model.page === 'confirm' && model.detail) fillConfirm(list, model.detail, model.deleteMessage);
    else if (model.detail) fillDetail(list, model.detail);
    else fillSections(list, model.sections);
    list.scrollTop = 0;
    p.panel.placeThumb();
  }

  function showForm(p: ReturnType<typeof build>, model: FeedbackSheetModel): void {
    setText(p.counter, model.counter);
    if (p.area.value !== model.text) p.area.value = model.text;
    if (p.area.placeholder !== model.placeholder) p.area.placeholder = model.placeholder;
    setText(p.status, model.line.text);
    buttonColour(p.status, model.line.message ? UI.yellow : UI.muted);
    choose(p.bug, model.kind === 'bug');
    choose(p.idea, model.kind === 'idea');
    p.box.disabled = !model.logAvailable;
    if (p.box.checked !== model.withLog) p.box.checked = model.withLog;
    buttonColour(p.log, model.withLog ? UI.white : model.logAvailable ? UI.muted : UI.empty);
    p.log.style.visibility = model.logShown ? 'visible' : 'hidden';
    buttonColour(p.send, model.canSend ? UI.yellow : UI.muted);
  }

  /** A keyboard player on "Löschen" lands on "Abbrechen" of the confirm, and back on "Löschen" after it (the pressed button hides). */
  function moveFocus(p: ReturnType<typeof build>, page: FeedbackSheetModel['page']): void {
    const active = document.activeElement;
    if (page === 'confirm' && active === p.del) p.no.focus({ preventScroll: true });
    else if (page === 'detail' && (active === p.no || active === p.yes)) p.del.focus({ preventScroll: true });
  }

  /**
   * "Wirklich löschen?" holds a few lines: the question, a panel of only their height and the buttons
   * sit as one block in the middle of the free space, instead of a tall empty panel over the buttons.
   */
  function placeConfirm(p: ReturnType<typeof build>, confirm: boolean): void {
    toggle([p.question], confirm, 'block');
    const flex = confirm ? '0 1 auto' : '1 1 auto';
    if (p.panel.frame.style.flex === flex) return;
    p.panel.frame.style.flex = flex;
    p.question.style.marginTop = confirm ? 'auto' : '0';
    p.confirmRow.style.marginBottom = confirm ? 'auto' : '0';
  }

  return {
    show(model) {
      if (!model) {
        parts.built?.sheet.setShown(false);
        panelShown = false;
        return;
      }
      const p = parts.get();
      const onTab = model.page === 'form' || model.page === 'list';
      const form = model.page === 'form';
      toggle([p.tabs], onTab);
      toggle([p.subHeader], !onTab);
      toggle([p.sentView], model.page === 'detail', 'block');
      setText(p.heading, model.page === 'confirm' ? '' : (model.title ?? ''));
      choose(p.newTab, model.tab === 'new');
      choose(p.mineTab, model.tab === 'mine');
      toggle([p.mineDot], model.dot, 'inline-block');
      toggle(p.form.filter((el) => el !== p.area), form);
      toggle([p.area], form, 'block');
      setText(p.note, model.note ?? '');
      toggle([p.note], model.note !== null, 'block');
      moveFocus(p, model.page);
      toggle([p.delRow], model.page === 'detail');
      toggle([p.confirmRow], model.page === 'confirm');
      placeConfirm(p, model.page === 'confirm');
      buttonColour(p.yes, model.deleting ? UI.muted : UI.red);
      panelShown = model.page !== 'form';
      toggle([p.panel.frame], panelShown);
      if (form) showForm(p, model);
      if (model.page !== 'form') fillPanel(p, model);
      else pageKey = '';
      p.sheet.setShown(true);
    },
    focus() {
      parts.built?.area.focus({ preventScroll: true });
    },
    blur() {
      parts.built?.area.blur();
    },
    isFocused() {
      return !!parts.built && document.activeElement === parts.built.area;
    },
    scrollKey,
  };
}
