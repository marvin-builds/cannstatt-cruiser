/**
 * What the feedback dialog's pages say (ROADMAP 70) and the status colours, DOM- and canvas-free:
 * "Das wird gesendet" (previewSections, also for a sent report from its
 * details), the "Mein Feedback" rows (reportRows) and a report's details
 * (reportDetail). The canvas screens (feedback-screen.ts) and the portrait
 * sheet (feedback-sheet.ts) both show these. German, kid-safe.
 */
import type { KeptReport, ReportStatus } from '../net/feedback-reports';
import type { FeedbackBody, FeedbackKind } from '../net/feedback-types';
import type { InputKind, Orientation, Platform } from '../net/telemetry-types';
import { UI } from './art';

export const FEEDBACK_PAGE_TEXT = {
  newTab: 'Neu',
  mineTab: 'Mein Feedback',
  view: 'Ansehen',
  back: 'Zurück',
  previewTitle: 'Das wird gesendet',
  sentTitle: 'Das wurde gesendet',
  empty: 'Noch kein Feedback von diesem Gerät',
  kind: 'Art',
  text: 'Text',
  version: 'Spielversion',
  device: 'Gerät',
  session: 'Sitzungsnummer (nur gegen Spam, wird nicht gespeichert)',
  log: 'Fehlerprotokoll',
  noErrors: 'Keine Fehler aufgezeichnet',
  unticked: 'Nicht angehakt, wird nicht gesendet',
  notSent: 'Nicht mitgesendet',
  notIncluded: 'Nicht dabei: Name, IP-Adresse, Geräte-ID, Highscores, deine Eingaben im Spiel.',
  testerPass: 'Testerpass',
  testerPassSent: 'Wird mitgesendet (Testgerät, ohne Tageslimit)',
} as const;

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Offen',
  todo: 'Geplant',
  done: 'Umgesetzt',
  rejected: 'Nicht geplant',
  removed: 'Entfernt',
};

/** The colour of each status: open grey, planned yellow, done green, not planned white, removed muted. */
export const STATUS_COLOR: Record<ReportStatus, string> = {
  open: UI.muted,
  todo: UI.yellow,
  done: UI.green,
  rejected: UI.white,
  removed: UI.plateEdge,
};

const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Fehler', idea: 'Idee' };
const PLATFORM_LABEL: Record<Platform, string> = { android: 'Android', ios: 'iPhone/iPad', other: 'Computer/anderes' };
const INPUT_LABEL: Record<InputKind, string> = { touch: 'Touch', keys: 'Tastatur' };
const ORIENTATION_LABEL: Record<Orientation, string> = { landscape: 'quer', portrait: 'hochkant' };

/** One block of a page: a label (or none) over its lines; `log` lines are the error log (shown as such, scrollable). */
export interface PageSection {
  label: string | null;
  lines: readonly string[];
  log: boolean;
}

/** What a page section is built from: a body about to be sent, or a kept report. */
type Message = Pick<FeedbackBody, 'kind' | 'text' | 'version' | 'platform' | 'input' | 'orientation' | 'viewWidth' | 'log' | 'testerPass'>;

/** "11.10.2026" for "2026-10-11". */
export function germanDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

const deviceText = (m: Message) =>
  `${PLATFORM_LABEL[m.platform]}, ${INPUT_LABEL[m.input]}, ${ORIENTATION_LABEL[m.orientation]}, ${m.viewWidth} px breit`;

/** The log section's lines when it is empty: nothing recorded, not ticked, or (a sent report) not sent. */
function emptyLog(session: string | null, logAvailable: boolean): string {
  if (session === null) return FEEDBACK_PAGE_TEXT.notSent;
  return logAvailable ? FEEDBACK_PAGE_TEXT.unticked : FEEDBACK_PAGE_TEXT.noErrors;
}

/**
 * The whole message: `session` is this page load's id for a preview, null for a sent report (never
 * kept); `logAvailable` says whether the error log had lines to tick. A tester pass is named, never shown.
 */
export function previewSections(m: Message, { session, logAvailable }: { session: string | null; logAvailable: boolean }): PageSection[] {
  const section = (label: string | null, lines: readonly string[], log = false): PageSection => ({ label, lines, log });
  return [
    section(FEEDBACK_PAGE_TEXT.kind, [KIND_LABEL[m.kind]]),
    section(FEEDBACK_PAGE_TEXT.text, [m.text]),
    section(FEEDBACK_PAGE_TEXT.version, [m.version]),
    section(FEEDBACK_PAGE_TEXT.device, [deviceText(m)]),
    ...(session !== null ? [section(FEEDBACK_PAGE_TEXT.session, [session])] : []),
    ...(m.kind === 'bug' ? [m.log.length > 0 ? section(FEEDBACK_PAGE_TEXT.log, m.log, true) : section(FEEDBACK_PAGE_TEXT.log, [emptyLog(session, logAvailable)])] : []),
    // A test device's pass (ROADMAP 75) goes along; the pass itself is not shown.
    ...(m.testerPass ? [section(FEEDBACK_PAGE_TEXT.testerPass, [FEEDBACK_PAGE_TEXT.testerPassSent])] : []),
    section(null, [FEEDBACK_PAGE_TEXT.notIncluded]),
  ];
}

export interface ReportRow {
  id: number;
  status: ReportStatus;
  label: string;
  kind: string;
  day: string;
  /** The text on one line (the row cuts it to its width). */
  text: string;
  /** Marked with the red dot: it changed since the player last looked. */
  changed: boolean;
  /** Just sent (ROADMAP 75): highlighted under the thanks. */
  fresh: boolean;
}

/** A row per report, in the given order (newest first); `marked` are the ids that get a dot, `fresh` the one just sent. */
export function reportRows(reports: readonly KeptReport[], marked: readonly number[], fresh: number | null): ReportRow[] {
  return reports.map((r) => ({
    id: r.id,
    status: r.status,
    label: STATUS_LABEL[r.status],
    kind: KIND_LABEL[r.kind],
    day: germanDay(r.day),
    text: r.text.replace(/\s+/g, ' ').trim(),
    changed: marked.includes(r.id),
    fresh: r.id === fresh,
  }));
}

export interface ReportDetail {
  status: ReportStatus;
  /** "Umgesetzt in Version 2026-10-12.1", or the status alone. */
  headline: string;
  /** 'Antwort: „…“', or null without a reply. */
  reply: string | null;
  text: string;
  /** When and with what it was sent. */
  sent: string;
}

export function reportDetail(r: KeptReport): ReportDetail {
  const log = r.kind === 'idea' ? [] : [r.log.length > 0 ? `Fehlerprotokoll (${r.log.length} Zeilen)` : 'ohne Fehlerprotokoll'];
  return {
    status: r.status,
    headline: r.doneVersion && r.status === 'done' ? `${STATUS_LABEL[r.status]} in Version ${r.doneVersion}` : STATUS_LABEL[r.status],
    reply: r.reply ? `Antwort: „${r.reply}“` : null,
    text: r.text,
    sent: [`Gesendet am ${germanDay(r.day)} mit: ${KIND_LABEL[r.kind]}`, `Version ${r.version}`, deviceText(r), ...log].join(', '),
  };
}
