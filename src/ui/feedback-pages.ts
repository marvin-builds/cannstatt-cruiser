/**
 * What the feedback dialog's pages say (ROADMAP 70) and the status colours, DOM- and canvas-free:
 * "Das wird gesendet" (previewSections, also for a sent report from its
 * details), the "Mein Feedback" rows (reportRows) and a report's details
 * (reportDetail). The canvas screens (feedback-screen.ts) and the portrait
 * sheet (feedback-sheet.ts) both show these. German, kid-safe.
 */
import type { KeptReport, ReportStatus } from '../net/feedback-reports';
import type { FeedbackBody } from '../net/feedback-types';
import { UI } from './art';
import { texts } from './i18n';

/** The colour of each status: open grey, planned yellow, done green, not planned white, removed muted. */
export const STATUS_COLOR: Record<ReportStatus, string> = {
  open: UI.muted,
  todo: UI.yellow,
  done: UI.green,
  rejected: UI.white,
  removed: UI.plateEdge,
};

/** One block of a page: a label (or none) over its lines; `log` lines are the error log (shown as such, scrollable). */
export interface PageSection {
  label: string | null;
  lines: readonly string[];
  log: boolean;
}

/** What a page section is built from: a body about to be sent, or a kept report. */
type Message = Pick<FeedbackBody, 'kind' | 'text' | 'version' | 'platform' | 'input' | 'orientation' | 'viewWidth' | 'log' | 'testerPass'>;

/** "11.10.2026" (German) or "Oct 11, 2026" (English) for "2026-10-11". */
export function dayText(day: string): string {
  const [year, month, date] = day.split('-');
  return texts().day(year!, month!, date!);
}

function deviceText(m: Message): string {
  const t = texts().feedbackPages;
  return `${t.platforms[m.platform]}, ${t.inputs[m.input]}, ${t.orientations[m.orientation]}, ${t.width(String(m.viewWidth))}`;
}

/** The log section's lines when it is empty: nothing recorded, not ticked, or (a sent report) not sent. */
function emptyLog(session: string | null, logAvailable: boolean): string {
  const t = texts().feedbackPages;
  if (session === null) return t.notSent;
  return logAvailable ? t.unticked : t.noErrors;
}

/**
 * The whole message: `session` is this page load's id for a preview, null for a sent report (never
 * kept); `logAvailable` says whether the error log had lines to tick. A tester pass is named, never shown.
 */
export function previewSections(m: Message, { session, logAvailable }: { session: string | null; logAvailable: boolean }): PageSection[] {
  const section = (label: string | null, lines: readonly string[], log = false): PageSection => ({ label, lines, log });
  const t = texts().feedbackPages;
  return [
    section(t.kind, [t.kinds[m.kind]]),
    section(t.text, [m.text]),
    section(t.version, [m.version]),
    section(t.device, [deviceText(m)]),
    ...(session !== null ? [section(t.session, [session])] : []),
    ...(m.kind === 'bug' ? [m.log.length > 0 ? section(t.log, m.log, true) : section(t.log, [emptyLog(session, logAvailable)])] : []),
    // A test device's pass (ROADMAP 75) goes along; the pass itself is not shown.
    ...(m.testerPass ? [section(t.testerPass, [t.testerPassSent])] : []),
    section(null, [t.notIncluded]),
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
  const t = texts().feedbackPages;
  return reports.map((r) => ({
    id: r.id,
    status: r.status,
    label: t.status[r.status],
    kind: t.kinds[r.kind],
    day: dayText(r.day),
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
  const t = texts().feedbackPages;
  const log = r.kind === 'idea' ? [] : [r.log.length > 0 ? t.logLines(r.log.length) : t.noLog];
  const status = t.status[r.status];
  return {
    status: r.status,
    headline: r.doneVersion && r.status === 'done' ? t.doneIn(status, r.doneVersion) : status,
    reply: r.reply ? t.reply(r.reply) : null,
    text: r.text,
    sent: [t.sentWith(dayText(r.day), t.kinds[r.kind]), t.versionOf(r.version), deviceText(r), ...log].join(', '),
  };
}
