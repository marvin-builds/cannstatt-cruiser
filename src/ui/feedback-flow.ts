/**
 * The feedback dialog (ROADMAP 50, 70) as a DOM-free state machine. Two tabs:
 * "Neu" is the form: kind ("Fehler" / "Idee"), the text (typed into the
 * native textarea of feedback-field.ts or the portrait sheet), "Fehlerprotokoll
 * mitsenden" (bug reports only, off by default, disabled while nothing was
 * recorded), "Ansehen" (the page "Das wird gesendet": a snapshot of the whole
 * message, and exactly that snapshot is what "Senden" sends while the draft
 * is unchanged) and the answer of the last send. "Mein Feedback" lists the
 * reports sent from this device (the inbox, src/net/feedback-status.ts): a row
 * opens its details, whose "Ansehen" shows what was sent. Opening that tab
 * marks every change as seen (the red dot) while the rows that changed keep
 * their dot as long as the dialog shows. Opened from the pause menu and the
 * title's speech-bubble icon (adult mode). A draft is kept in memory for this
 * page load until it was sent.
 */
import type { FeedbackContext, FeedbackSenderLike } from '../net/feedback';
import type { KeptReport } from '../net/feedback-reports';
import type { FeedbackInboxLike } from '../net/feedback-status';
import { type FeedbackBody, type FeedbackKind, MAX_FEEDBACK_TEXT, MIN_FEEDBACK_TEXT } from '../net/feedback-types';
import { type PageSection, previewSections, type ReportDetail, reportDetail, type ReportRow, reportRows } from './feedback-pages';

export type FeedbackStatus = 'idle' | 'short' | 'sending' | 'sent' | 'rate' | 'offline' | 'invalid';
export type FeedbackTab = 'new' | 'mine';
/** form / preview ("Ansehen") on "Neu"; list / detail / sent (a report's "Ansehen") on "Mein Feedback". */
export type FeedbackPage = 'form' | 'preview' | 'list' | 'detail' | 'sent';

/** Where "Zurück" leads from each page (none from the tabs' first pages). */
const BACK: Record<FeedbackPage, FeedbackPage | null> = { form: null, preview: 'form', list: null, detail: 'list', sent: 'detail' };

/** All texts of the screen (German, kid-safe, game font). */
export const FEEDBACK_TEXT = {
  title: 'Feedback',
  bug: 'Fehler',
  idea: 'Idee',
  log: 'Fehlerprotokoll mitsenden',
  /** The log label's short form where the long one does not fit beside "Ansehen". */
  logShort: 'Protokoll mitsenden',
  send: 'Senden',
  ok: 'OK',
  hint: 'Bitte keine persönlichen Daten.',
  bugPlaceholder: 'Was ist passiert?',
  ideaPlaceholder: 'Was wünschst du dir?',
  sending: 'Wird gesendet ...',
  sent: 'Danke für dein Feedback!',
  rate: 'Heute schon genug Feedback – danke!',
  offline: 'Keine Verbindung. Später nochmal.',
  invalid: 'Ging leider nicht. Text ändern.',
  short: `Bitte mindestens ${MIN_FEEDBACK_TEXT} Zeichen schreiben.`,
} as const;

const MESSAGES: Record<FeedbackStatus, string | null> = {
  idle: null,
  short: FEEDBACK_TEXT.short,
  sending: FEEDBACK_TEXT.sending,
  sent: FEEDBACK_TEXT.sent,
  rate: FEEDBACK_TEXT.rate,
  offline: FEEDBACK_TEXT.offline,
  invalid: FEEDBACK_TEXT.invalid,
};

export class FeedbackFlow {
  open = false;
  kind: FeedbackKind = 'bug';
  text = '';
  /** "Fehlerprotokoll mitsenden": off until ticked, counts for bug reports with a recorded log only. */
  withLog = false;
  status: FeedbackStatus = 'idle';
  tab: FeedbackTab = 'new';
  page: FeedbackPage = 'form';
  /** The open page's scroll offset in view px (the canvas pages; the portrait sheet scrolls natively). */
  scroll = 0;
  /** The report whose details show. */
  private selected: number | null = null;
  /** The reports that had changed when "Mein Feedback" was opened: their rows keep the dot. */
  private marked: number[] = [];
  /** The "Ansehen" snapshot and the draft it was taken from. */
  private snapshot: { body: FeedbackBody; draft: string } | null = null;

  constructor(
    private readonly sender: FeedbackSenderLike,
    private readonly inbox: FeedbackInboxLike | null,
  ) {}

  get sending(): boolean {
    return this.status === 'sending';
  }

  /** Sent: the screen thanks the player instead of the form. */
  get done(): boolean {
    return this.status === 'sent';
  }

  /** The log box shows for bug reports only. */
  get logShown(): boolean {
    return this.kind === 'bug';
  }

  /** The error log has lines: only then the box can be ticked. */
  get logAvailable(): boolean {
    return this.sender.hasLog;
  }

  get canSend(): boolean {
    return !this.sending && !this.done && this.text.trim().length >= MIN_FEEDBACK_TEXT;
  }

  get counter(): string {
    return `${this.text.length}/${MAX_FEEDBACK_TEXT}`;
  }

  /** The status line in place of the hint, or null for the hint. */
  get message(): string | null {
    return MESSAGES[this.status];
  }

  /** The red dot on "Mein Feedback" (and on the title icon and the pause button): something changed that the player has not seen. */
  get dot(): boolean {
    return !!this.inbox?.changed;
  }

  /** "Mein Feedback": a row per report, newest first. */
  get rows(): ReportRow[] {
    return this.inbox ? reportRows(this.inbox.reports, this.marked) : [];
  }

  /** The report whose details (or sent message) show, or null. */
  get report(): KeptReport | null {
    return this.inbox?.reports.find((r) => r.id === this.selected) ?? null;
  }

  get detail(): ReportDetail | null {
    const report = this.report;
    return report ? reportDetail(report) : null;
  }

  /** The "Ansehen" snapshot while its page shows, else null. */
  get preview(): FeedbackBody | null {
    return this.page === 'preview' ? (this.snapshot?.body ?? null) : null;
  }

  /** The sections of "Das wird gesendet" (preview) or of a sent report (sent), else none. */
  get sections(): PageSection[] {
    const preview = this.preview;
    if (preview) return previewSections(preview, { session: preview.session, logAvailable: this.logAvailable });
    const report = this.page === 'sent' ? this.report : null;
    return report ? previewSections(report, { session: null, logAvailable: true }) : [];
  }

  /** Shows the dialog on "Neu": the draft as left, or a fresh one after a sent report. */
  openForm(): void {
    if (this.done) {
      this.kind = 'bug';
      this.text = '';
      this.withLog = false;
    }
    if (!this.sending) this.status = 'idle';
    this.marked = [];
    this.go('new', 'form');
    this.open = true;
  }

  close(): void {
    if (!this.sending) this.open = false;
  }

  /**
   * The screen it was opened on is gone (a run started, the pause ended): closes even while a report
   * is being sent; its answer still sets the status, the draft stays unless it was sent.
   */
  dismiss(): void {
    this.open = false;
  }

  /** A tab: "Mein Feedback" marks every change as seen (the rows that changed keep their dot). */
  showTab(tab: FeedbackTab): void {
    if (tab === 'mine' && this.tab !== 'mine' && this.inbox) {
      this.marked = this.inbox.changedIds();
      this.inbox.markSeen();
    }
    this.go(tab, tab === 'new' ? 'form' : 'list');
  }

  /** "Ansehen" on the form: a snapshot of the whole message as it would be sent now. */
  openPreview(context: FeedbackContext): void {
    if (this.sending || this.done) return;
    this.snapshot = { body: this.sender.prepare(this.draft(), context), draft: this.draftKey() };
    this.go('new', 'preview');
  }

  /** A row of "Mein Feedback": its details. */
  openReport(id: number): void {
    if (!this.inbox?.reports.some((r) => r.id === id)) return;
    this.selected = id;
    this.go('mine', 'detail');
  }

  /** "Ansehen" on a report's details: what was sent. */
  openSentLog(): void {
    if (this.page === 'detail' && this.report) this.go('mine', 'sent');
  }

  /** "Zurück" (and Esc): the page before, or false on a tab's first page. */
  back(): boolean {
    const to = BACK[this.page];
    if (to === null) return false;
    this.go(this.tab, to);
    return true;
  }

  /** Drag, wheel and keys on a scrolling page (kept in range by clampScroll). */
  scrollBy(dy: number): void {
    this.scroll = Math.max(0, this.scroll + dy);
  }

  clampScroll(max: number): void {
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, max)));
  }

  setKind(kind: FeedbackKind): void {
    if (!this.sending && !this.done) this.kind = kind;
  }

  toggleLog(): void {
    if (!this.sending && !this.done && this.logShown && this.logAvailable) this.withLog = !this.withLog;
  }

  /** Typing: capped at MAX_FEEDBACK_TEXT; a refused or too short text may be sent again. */
  setText(raw: string): void {
    if (this.sending || this.done) return;
    this.text = raw.slice(0, MAX_FEEDBACK_TEXT);
    if (this.status === 'short' || this.status === 'invalid') this.status = 'idle';
  }

  /**
   * "Senden": one request with the "Ansehen" snapshot while the draft is unchanged since, else a
   * fresh one; the answer decides the status (the text stays unless it was sent).
   */
  async send(context: FeedbackContext): Promise<void> {
    if (this.sending || this.done) return;
    if (!this.canSend) {
      this.status = 'short';
      return;
    }
    const body = this.snapshot?.draft === this.draftKey() ? this.snapshot.body : this.sender.prepare(this.draft(), context);
    this.status = 'sending';
    const result = await this.sender.send(body);
    this.status = result;
    if (result === 'sent') this.snapshot = null;
  }

  private go(tab: FeedbackTab, page: FeedbackPage): void {
    this.tab = tab;
    this.page = page;
    this.scroll = 0;
  }

  private draft() {
    return { kind: this.kind, text: this.text, withLog: this.logShown && this.withLog && this.logAvailable };
  }

  private draftKey(): string {
    return JSON.stringify(this.draft());
  }
}
