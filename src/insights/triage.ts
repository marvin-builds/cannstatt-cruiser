/**
 * Pure helpers of feedback triage on the board (ROADMAP 56): status labels and
 * filter chips, the GitHub issue draft (title, body, optional log) and German error texts.
 * The repo is public, so the draft quotes the player and defuses @mentions;
 * the operator reviews and edits it before it is sent.
 */
import { kindLabel, metaLine } from './feedback';
import { formatDate } from './format';
import {
  DONE_VERSION_PATTERN, FEEDBACK_STATUSES, ISSUE_REPO, MAX_ISSUE_TITLE, type FeedbackStatus, type FeedbackTriage, type TriagedFeedbackEntry,
} from './triage-types';

/** The stored value 'todo' reads 'Geplant', as in the game's "Mein Feedback" (ROADMAP 75); 'open' reads 'Neu' (ROADMAP 80). */
const STATUSES: Record<FeedbackStatus, string> = { open: 'Neu', todo: 'Geplant', done: 'Erledigt', rejected: 'Abgelehnt' };

export function statusLabel(status: FeedbackStatus): string {
  return STATUSES[status];
}

/** 'Erledigt in 2026-10-12.1' for a done entry with a version, else the status label. */
export function statusText({ status, doneVersion }: Pick<FeedbackTriage, 'status' | 'doneVersion'>): string {
  return status === 'done' && doneVersion ? `${STATUSES.done} in ${doneVersion}` : STATUSES[status];
}

/** The 'umgesetzt in Version' field: empty is no version (null), a valid version trimmed, anything else undefined. */
export function parseDoneVersion(raw: string): string | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  return DONE_VERSION_PATTERN.test(value) ? value : undefined;
}

/** 'mit Fehlerprotokoll' when the player attached the log, else null. */
export function logNote(entry: TriagedFeedbackEntry): string | null {
  return entry.log.length ? 'mit Fehlerprotokoll' : null;
}

/** The status filter chips (ROADMAP 80), in workflow order. */
export const STATUS_CHIPS: { value: FeedbackStatus; label: string }[] = FEEDBACK_STATUSES.map((value) => ({ value, label: STATUSES[value] }));

/** On by default: Neu and Geplant, so closed tickets stay out of the way. */
export const DEFAULT_STATUSES: readonly FeedbackStatus[] = ['open', 'todo'];

/** Turns one status chip on or off; the result keeps the chip order. */
export function toggleStatus(statuses: readonly FeedbackStatus[], status: FeedbackStatus): FeedbackStatus[] {
  const on = statuses.includes(status);
  return FEEDBACK_STATUSES.filter((s) => (s === status ? !on : statuses.includes(s)));
}

const ISSUES_PAGE = `https://github.com/${ISSUE_REPO}/issues/`;

export function issueUrl(issue: number): string {
  return `${ISSUES_PAGE}${issue}`;
}

/** The issue number field of 'Bestehendes Issue verknüpfen': '12', '#12' or a link to an issue of the repo; null otherwise. */
export function parseIssueNumber(raw: string): number | null {
  const value = raw.trim();
  const digits = value.startsWith(ISSUES_PAGE) ? /^(\d+)(?:[#?].*)?$/.exec(value.slice(ISSUES_PAGE.length))?.[1] : /^#?(\d+)$/.exec(value)?.[1];
  const issue = digits ? Number(digits) : NaN;
  return Number.isSafeInteger(issue) && issue > 0 ? issue : null;
}

const TITLE_WORDS = 8;
const TITLE_TEXT_CHARS = 60;

/** 'Idee: Bitte mehr Hunde im Park!': the kind and the first words of the first line. */
export function issueTitle(entry: TriagedFeedbackEntry): string {
  const words = (entry.text.split('\n')[0] ?? '').split(/\s+/).filter(Boolean);
  let text = words.slice(0, TITLE_WORDS).join(' ');
  const cut = words.length > TITLE_WORDS || text.length > TITLE_TEXT_CHARS;
  if (text.length > TITLE_TEXT_CHARS) text = text.slice(0, TITLE_TEXT_CHARS);
  if (cut) text = `${text.replace(/[\s,;:.-]+$/, '')} …`;
  return `${kindLabel(entry.kind)}: ${text}`.slice(0, MAX_ISSUE_TITLE);
}

/** '@name' would notify that GitHub user; a zero-width joiner after the @ keeps the text readable. */
const defuseMentions = (text: string) => text.replace(/(^|[^\w])@(?=\w)/g, '$1@‍');

const quote = (text: string) => text.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n');

/** The log as a collapsed code block, starting with a blank line; the fence outgrows any backticks in it. */
export function logSection(log: readonly string[]): string {
  const longest = Math.max(0, ...log.map((line) => Math.max(0, ...(line.match(/`+/g) ?? []).map((run) => run.length))));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `\n\n<details><summary>Fehlerprotokoll</summary>\n\n${fence}text\n${log.join('\n')}\n${fence}\n\n</details>`;
}

/** The quoted text, the meta line and a note; with `withLog` the log section at the end. */
export function issueBody(entry: TriagedFeedbackEntry, withLog: boolean): string {
  const body = [
    quote(defuseMentions(entry.text)),
    metaLine(entry),
    `Spieler-Feedback (${kindLabel(entry.kind)}) vom ${formatDate(entry.day)}, vor dem Veröffentlichen geprüft.`,
  ].join('\n\n');
  return withLog ? toggleLog(body, entry.log, true) : body;
}

/** Adds the log section (once) or removes it, leaving the rest of the edited body as it is. */
export function toggleLog(body: string, log: readonly string[], on: boolean): string {
  const section = logSection(log);
  if (!on) return body.replace(section, '');
  return body.includes(section) ? body : body.trimEnd() + section;
}

export type TriageError =
  | { error: 'auth' | 'offline' | 'server' | 'not-found' | 'bad-request' | 'github-token-missing' | 'issue-not-found' | 'no-issue' }
  | { error: 'github'; status: number }
  | { error: 'exists'; issue: number };

export function triageErrorText(failure: TriageError): string {
  switch (failure.error) {
    case 'auth': return 'Token falsch';
    case 'offline': return 'Keine Verbindung zum Server.';
    case 'server': return 'Der Server hat unerwartet geantwortet.';
    case 'not-found': return 'Diesen Eintrag gibt es nicht mehr.';
    case 'bad-request': return 'Eingabe ungültig (Länge oder Zeichen prüfen).';
    case 'github-token-missing': return 'Im Worker fehlt das Secret GITHUB_TOKEN.';
    case 'github':
      if (failure.status === 401) return 'GitHub-Token ungültig, neu setzen';
      return failure.status ? `GitHub hat abgelehnt (Status ${failure.status}).` : 'GitHub nicht erreichbar.';
    case 'exists': return `Hat schon Issue #${failure.issue}.`;
    case 'issue-not-found': return 'Dieses Issue gibt es nicht (Nummer prüfen).';
    case 'no-issue': return 'Ohne Issue geht das nicht: erst ein Issue verknüpfen.';
  }
}
