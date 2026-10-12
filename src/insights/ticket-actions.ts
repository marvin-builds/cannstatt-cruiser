/**
 * The ticket workflow of the board (ROADMAP 82, 83) as pure functions: which actions a ticket offers in its
 * state, whether it needs the operator (the Feedback tab count), where Öffnen and Abschließen lead, and the
 * state of the linked GitHub issue as a short German text.
 */
import { formatDay } from './format';
import type { FeedbackStatus, FeedbackTriage, IssueState } from './triage-types';

export type TicketActionKind = 'implement' | 'reject' | 'complete' | 'link' | 'reopen' | 'reply' | 'delete';

export interface TicketAction {
  kind: TicketActionKind;
  label: string;
  /** Why the action is greyed out, shown next to it; null when it can be used. */
  disabledReason: string | null;
}

type Ticket = Pick<FeedbackTriage, 'status' | 'issue' | 'issueState'>;

const act = (kind: TicketActionKind, label: string, disabledReason: string | null = null): TicketAction => ({ kind, label, disabledReason });

const REPLY = act('reply', 'Antwort ändern');
const DELETE = act('delete', 'Löschen');
const REJECT = act('reject', 'Ablehnen');
const LINK = act('link', 'Issue verknüpfen');

/** Why Abschließen waits, by the issue state; a closed issue has no reason. */
const WAITING: Record<IssueState | 'unknown', string | null> = {
  unknown: 'Issue-Status noch unbekannt',
  open: 'erst wenn das Issue geschlossen ist',
  missing: 'Issue auf GitHub nicht gefunden',
  completed: null,
  notPlanned: null,
};

/** The actions of a ticket in the order the board shows them (ROADMAP 83); 'Antwort ändern' in every state. */
export function ticketActions(ticket: Ticket): TicketAction[] {
  switch (ticket.status) {
    case 'open':
      return [act('implement', 'Umsetzen'), REJECT, REPLY, DELETE];
    case 'todo':
      if (ticket.issue === null) return [LINK, REJECT, REPLY];
      return [
        act('complete', 'Abschließen', WAITING[ticket.issueState ?? 'unknown']),
        ...(ticket.issueState === 'missing' ? [LINK] : []),
        REPLY,
      ];
    case 'done':
      return [act('reopen', 'Wieder öffnen'), REPLY];
    case 'rejected':
      return [act('reopen', 'Öffnen'), REPLY, DELETE];
  }
}

/** Geplant with an issue that GitHub shows closed: "bereit zum Abschließen". */
export function readyToClose(ticket: Ticket): boolean {
  return ticket.status === 'todo' && ticket.issue !== null && (ticket.issueState === 'completed' || ticket.issueState === 'notPlanned');
}

/** Neu, or ready to close: the tickets the Feedback tab counts. */
export function needsAction(ticket: Ticket): boolean {
  return ticket.status === 'open' || readyToClose(ticket);
}

export function actionCount(tickets: readonly Ticket[]): number {
  return tickets.filter(needsAction).length;
}

/** Öffnen and Wieder öffnen lead back to Geplant when an issue is linked, else to Neu. */
export function reopenStatus(ticket: Ticket): Extract<FeedbackStatus, 'open' | 'todo'> {
  return ticket.issue === null ? 'open' : 'todo';
}

/** Abschließen sets Erledigt for an issue closed as done and Abgelehnt for one closed as not planned; null while it cannot. */
export function closeOutcome(ticket: Ticket): Extract<FeedbackStatus, 'done' | 'rejected'> | null {
  if (!readyToClose(ticket)) return null;
  return ticket.issueState === 'completed' ? 'done' : 'rejected';
}

const STATE_WORDS: Record<IssueState, string> = { open: 'offen', completed: 'erledigt', notPlanned: 'verworfen', missing: 'nicht gefunden' };

/** '#7 · offen', '#7 · erledigt am 12.10.', '#7 · verworfen am 12.10.', '#7 · nicht gefunden'; '#7' before the first read; null without an issue. */
export function issueStateText(ticket: Pick<FeedbackTriage, 'issue' | 'issueState' | 'issueClosedDay'>): string | null {
  if (ticket.issue === null) return null;
  if (!ticket.issueState) return `#${ticket.issue}`;
  const closed = ticket.issueState === 'completed' || ticket.issueState === 'notPlanned';
  const day = closed && ticket.issueClosedDay ? ` am ${formatDay(ticket.issueClosedDay)}` : '';
  return `#${ticket.issue} · ${STATE_WORDS[ticket.issueState]}${day}`;
}
