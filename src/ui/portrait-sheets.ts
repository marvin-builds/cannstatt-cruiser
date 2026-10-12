/**
 * Portrait sheets (ROADMAP 58, 59, 70): in portrait the 180 px high view is a thin
 * strip, so the feedback dialog (both tabs and their pages), the highscore name entry and the "Neu in dieser
 * Version" list show as full-screen DOM sheets instead (feedback-sheet.ts,
 * entry-sheet.ts, whats-new-sheet.ts over sheet-dom.ts), with the same flows,
 * texts and submission as the canvas screens. This module holds what a sheet
 * shows (pure, from the flow) and the sizes they share.
 */
import { FEEDBACK_TEXT, type FeedbackFlow, type FeedbackPage, type FeedbackTab } from './feedback-flow';
import type { FeedbackKind } from '../net/feedback-types';
import { FEEDBACK_PAGE_TEXT, type PageSection, type ReportDetail, type ReportRow } from './feedback-pages';
import { feedbackPlaceholder } from './feedback-screen';
import type { HighscoreFlow } from './highscore-flow';
import { formatNumber } from './layout';
import { submitButtonLabel } from './score-screens';
import type { ChangelogEntry } from '../types';
import { versionHeading } from './whats-new';

/** CSS sizes of the sheets: body and small text, the headline, buttons (at least 48 px tall). */
export const SHEET_STYLE = { textPx: 18, smallPx: 16, titlePx: 26, buttonPx: 52, gapPx: 12, padPx: 16 } as const;

/** Whether a text form shows as its portrait sheet: open and on screen (not under the rotate hint) in portrait. */
export function sheetShown(display: { portrait: boolean }, formShown: boolean): boolean {
  return formShown && display.portrait;
}

export interface FeedbackSheetModel {
  tab: FeedbackTab;
  page: FeedbackPage;
  /** The red dot on "Mein Feedback". */
  dot: boolean;
  /** Just sent: the thanks over "Mein Feedback" (ROADMAP 75). */
  thanks: boolean;
  kind: FeedbackKind;
  text: string;
  placeholder: string;
  logShown: boolean;
  /** The log box can be ticked (the error log has lines). */
  logAvailable: boolean;
  withLog: boolean;
  canSend: boolean;
  counter: string;
  /** The privacy hint, or a status message (`message` true) in its place. */
  line: { text: string; message: boolean };
  /** The headline of "Das wird gesendet" / "Das wurde gesendet", else null. */
  title: string | null;
  /** Their sections, the "Mein Feedback" rows, a report's details (each empty / null off its page). */
  sections: PageSection[];
  rows: ReportRow[];
  detail: ReportDetail | null;
}

export function feedbackSheetModel(flow: FeedbackFlow): FeedbackSheetModel {
  const message = flow.message;
  const title = flow.page === 'preview' ? FEEDBACK_PAGE_TEXT.previewTitle : flow.page === 'sent' ? FEEDBACK_PAGE_TEXT.sentTitle : null;
  return {
    tab: flow.tab,
    page: flow.page,
    dot: flow.dot,
    thanks: flow.thanks,
    kind: flow.kind,
    text: flow.text,
    placeholder: feedbackPlaceholder(flow),
    logShown: flow.logShown,
    logAvailable: flow.logAvailable,
    withLog: flow.withLog && flow.logAvailable,
    canSend: flow.canSend,
    counter: flow.counter,
    line: { text: message ?? FEEDBACK_TEXT.hint, message: message !== null },
    title,
    sections: flow.sections,
    rows: flow.page === 'list' ? flow.rows : [],
    detail: flow.page === 'detail' ? flow.detail : null,
  };
}

export interface EntrySheetModel {
  /** "12.345 Punkte". */
  score: string;
  name: string;
  /** "Als <Name> eintragen" once the name is valid (submitButtonLabel). */
  submit: string;
  canSubmit: boolean;
  message: string | null;
}

export function entrySheetModel(flow: Pick<HighscoreFlow, 'score' | 'name' | 'canSubmit' | 'sending' | 'message'>): EntrySheetModel {
  return { score: `${formatNumber(flow.score)} Punkte`, name: flow.name, submit: submitButtonLabel(flow), canSubmit: flow.canSubmit, message: flow.message };
}

export interface WhatsNewSection {
  heading: string;
  items: readonly string[];
}

/** The "Neu in dieser Version" sheet: each changelog entry under its version heading, in the given order. */
export function whatsNewSections(entries: readonly ChangelogEntry[]): WhatsNewSection[] {
  return entries.map((e) => ({ heading: versionHeading(e.version), items: e.items }));
}
