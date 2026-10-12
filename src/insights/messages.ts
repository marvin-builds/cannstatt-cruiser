/**
 * Every prefilled player message of the ticket workflow (ROADMAP 83) in one place. Players read them under
 * "Mein Feedback", in kid mode too, so they stay short, friendly and kid-safe; messages.test.ts checks
 * each against MAX_REPLY_CHARS.
 */
import type { FeedbackKind } from '../net/feedback-types';

/** Umsetzen: the issue is made or linked, the ticket is Geplant. */
export const PLANNED_MESSAGE = 'Die Umsetzung deines Feedbacks wurde geplant, danke für dein Feedback!';
/** Abschließen of a ticket whose issue was closed as not planned. */
export const NOT_PLANNED_MESSAGE = 'Wir haben es versucht, aber es passt leider nicht ins Spiel. Danke trotzdem!';
/** Wieder öffnen of an Erledigt ticket (e.g. the bug is back). */
export const REOPEN_DONE_MESSAGE = 'Wir kümmern uns nochmal darum.';
/** Öffnen of an Abgelehnt ticket: replaces the rejection so the player does not keep seeing it. */
export const REOPEN_REJECTED_MESSAGE = 'Wir schauen uns dein Feedback nochmal an.';

const REJECT: Record<FeedbackKind, readonly string[]> = {
  bug: ['Danke! Das konnten wir leider nicht nachstellen.', 'Danke! Das ist so gewollt und bleibt so.', 'Danke! Das ist schon behoben.'],
  idea: ['Danke für dein Feedback! Das passt leider nicht ins Spiel.', 'Danke! Das gibt es so schon im Spiel.'],
};

/** The texts Ablehnen offers to pick from, the most likely first. */
export function rejectMessages(kind: FeedbackKind): readonly string[] {
  return REJECT[kind];
}

/** Abschließen of a ticket whose issue was done: names the version it shipped in, if known. */
export function doneMessage(version: string | null): string {
  return version ? `Ist drin seit Version ${version}. Danke für dein Feedback!` : 'Ist jetzt im Spiel. Danke für dein Feedback!';
}

/** All default texts, the done message with the longest version the board accepts (for the length test). */
export function defaultMessages(): string[] {
  return [
    PLANNED_MESSAGE, NOT_PLANNED_MESSAGE, REOPEN_DONE_MESSAGE, REOPEN_REJECTED_MESSAGE, ...REJECT.bug, ...REJECT.idea,
    doneMessage('2026-10-12.99'), doneMessage(null),
  ];
}
