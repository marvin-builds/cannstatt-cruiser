/**
 * The feedback screen (ROADMAP 50) as a DOM-free state machine: kind
 * ("Fehler" / "Idee"), the text (typed into the native textarea of
 * feedback-field.ts), "Fehlerprotokoll mitsenden" (bug reports only, off by
 * default) and the answer of the last send. Opened from the pause menu and
 * the title's speech-bubble icon (adult mode). A draft is kept in memory for
 * this page load until it was sent; nothing is stored.
 */
import type { FeedbackContext, FeedbackSenderLike } from '../net/feedback';
import { type FeedbackKind, MAX_FEEDBACK_TEXT, MIN_FEEDBACK_TEXT } from '../net/feedback-types';

export type FeedbackStatus = 'idle' | 'short' | 'sending' | 'sent' | 'rate' | 'offline' | 'invalid';

/** All texts of the screen (German, kid-safe, game font). */
export const FEEDBACK_TEXT = {
  title: 'Feedback',
  bug: 'Fehler',
  idea: 'Idee',
  log: 'Fehlerprotokoll mitsenden',
  /** The log label broken in two where one line is too wide, and its short form for the narrowest views. */
  logLong: ['Fehlerprotokoll', 'mitsenden'],
  logShort: ['Protokoll', 'mitsenden'],
  send: 'Senden',
  cancel: 'Abbrechen',
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
  /** "Fehlerprotokoll mitsenden": off until ticked, counts for bug reports only. */
  withLog = false;
  status: FeedbackStatus = 'idle';

  constructor(private readonly sender: FeedbackSenderLike) {}

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

  /** Shows the form: the draft as left, or a fresh one after a sent report. */
  openForm(): void {
    if (this.done) {
      this.kind = 'bug';
      this.text = '';
      this.withLog = false;
    }
    if (!this.sending) this.status = 'idle';
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

  setKind(kind: FeedbackKind): void {
    if (!this.sending && !this.done) this.kind = kind;
  }

  toggleLog(): void {
    if (!this.sending && !this.done && this.logShown) this.withLog = !this.withLog;
  }

  /** Typing: capped at MAX_FEEDBACK_TEXT; a refused or too short text may be sent again. */
  setText(raw: string): void {
    if (this.sending || this.done) return;
    this.text = raw.slice(0, MAX_FEEDBACK_TEXT);
    if (this.status === 'short' || this.status === 'invalid') this.status = 'idle';
  }

  /** "Senden": one request; the answer decides the status (the text stays unless it was sent). */
  async send(context: FeedbackContext): Promise<void> {
    if (this.sending || this.done) return;
    if (!this.canSend) {
      this.status = 'short';
      return;
    }
    this.status = 'sending';
    const result = await this.sender.send({ kind: this.kind, text: this.text, withLog: this.logShown && this.withLog }, context);
    this.status = result;
  }
}
