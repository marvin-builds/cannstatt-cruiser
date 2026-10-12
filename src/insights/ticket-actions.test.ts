import { describe, expect, it } from 'vitest';
import {
  actionCount, closeOutcome, issueStateText, needsAction, readyToClose, reopenStatus, ticketActions, type TicketActionKind,
} from './ticket-actions';
import type { FeedbackStatus, FeedbackTriage, IssueState } from './triage-types';

const ticket = (status: FeedbackStatus, issue: number | null = null, issueState: IssueState | null = null, issueClosedDay: string | null = null): FeedbackTriage => ({
  status, issue, reply: null, doneVersion: null, issueState, issueClosedDay,
});

const kinds = (t: FeedbackTriage): TicketActionKind[] => ticketActions(t).map((a) => a.kind);
const action = (t: FeedbackTriage, kind: TicketActionKind) => ticketActions(t).find((a) => a.kind === kind);

describe('ticketActions', () => {
  it('Neu: Umsetzen, Ablehnen, Antwort ändern, Löschen', () => {
    expect(ticketActions(ticket('open')).map((a) => a.label)).toEqual(['Umsetzen', 'Ablehnen', 'Antwort ändern', 'Löschen']);
    expect(ticketActions(ticket('open')).every((a) => a.disabledReason === null)).toBe(true);
  });

  it('Geplant with an open issue: Abschließen disabled with a reason, no Löschen', () => {
    expect(kinds(ticket('todo', 7, 'open'))).toEqual(['complete', 'reply']);
    expect(action(ticket('todo', 7, 'open'), 'complete')).toEqual({ kind: 'complete', label: 'Abschließen', disabledReason: 'erst wenn das Issue geschlossen ist' });
  });

  it('Geplant with an issue not read yet: Abschließen disabled', () => {
    expect(action(ticket('todo', 7, null), 'complete')?.disabledReason).toBe('Issue-Status noch unbekannt');
  });

  it('Geplant with a closed issue (done or not planned): Abschließen enabled', () => {
    for (const state of ['completed', 'notPlanned'] as const) {
      expect(kinds(ticket('todo', 7, state))).toEqual(['complete', 'reply']);
      expect(action(ticket('todo', 7, state), 'complete')?.disabledReason).toBeNull();
    }
  });

  it('Geplant with a missing issue: Abschließen disabled with a hint, Issue verknüpfen offered', () => {
    expect(kinds(ticket('todo', 7, 'missing'))).toEqual(['complete', 'link', 'reply']);
    expect(action(ticket('todo', 7, 'missing'), 'complete')?.disabledReason).toBe('Issue auf GitHub nicht gefunden');
    expect(action(ticket('todo', 7, 'missing'), 'link')?.label).toBe('Issue verknüpfen');
  });

  it('Geplant without an issue (legacy): Issue verknüpfen and Ablehnen', () => {
    expect(kinds(ticket('todo'))).toEqual(['link', 'reject', 'reply']);
  });

  it('Erledigt: Wieder öffnen; Abgelehnt: Öffnen and Löschen', () => {
    expect(ticketActions(ticket('done', 7, 'completed')).map((a) => a.label)).toEqual(['Wieder öffnen', 'Antwort ändern']);
    expect(ticketActions(ticket('done')).map((a) => a.label)).toEqual(['Wieder öffnen', 'Antwort ändern']);
    expect(ticketActions(ticket('rejected')).map((a) => a.label)).toEqual(['Öffnen', 'Antwort ändern', 'Löschen']);
    expect(ticketActions(ticket('rejected', 7, 'notPlanned')).map((a) => a.label)).toEqual(['Öffnen', 'Antwort ändern', 'Löschen']);
  });

  it('offers Antwort ändern in every state', () => {
    const all = [ticket('open'), ticket('todo'), ticket('todo', 7, 'open'), ticket('todo', 7, 'missing'), ticket('done'), ticket('rejected')];
    for (const t of all) expect(kinds(t)).toContain('reply');
  });
});

describe('readyToClose, needsAction and actionCount', () => {
  it('is ready to close only as Geplant with a closed issue', () => {
    expect(readyToClose(ticket('todo', 7, 'completed'))).toBe(true);
    expect(readyToClose(ticket('todo', 7, 'notPlanned'))).toBe(true);
    for (const t of [ticket('todo', 7, 'open'), ticket('todo', 7, 'missing'), ticket('todo', 7, null), ticket('done', 7, 'completed'), ticket('rejected', 7, 'notPlanned'), ticket('open')]) {
      expect(readyToClose(t)).toBe(false);
    }
  });

  it('counts Neu and the tickets ready to close', () => {
    const list = [ticket('open'), ticket('open'), ticket('todo', 7, 'completed'), ticket('todo', 8, 'open'), ticket('done'), ticket('rejected'), ticket('todo')];
    expect(list.map(needsAction)).toEqual([true, true, true, false, false, false, false]);
    expect(actionCount(list)).toBe(3);
    expect(actionCount([])).toBe(0);
  });
});

describe('reopenStatus and closeOutcome', () => {
  it('reopens to Geplant with an issue, else to Neu', () => {
    expect(reopenStatus(ticket('done', 7, 'completed'))).toBe('todo');
    expect(reopenStatus(ticket('rejected', 7, 'notPlanned'))).toBe('todo');
    expect(reopenStatus(ticket('done'))).toBe('open');
    expect(reopenStatus(ticket('rejected'))).toBe('open');
  });

  it('closes a done issue as Erledigt and a not planned one as Abgelehnt', () => {
    expect(closeOutcome(ticket('todo', 7, 'completed'))).toBe('done');
    expect(closeOutcome(ticket('todo', 7, 'notPlanned'))).toBe('rejected');
    expect(closeOutcome(ticket('todo', 7, 'open'))).toBeNull();
    expect(closeOutcome(ticket('todo', 7, 'missing'))).toBeNull();
  });
});

describe('issueStateText', () => {
  it('names the issue and its state with the closing day', () => {
    expect(issueStateText(ticket('todo', 7, 'open'))).toBe('#7 · offen');
    expect(issueStateText(ticket('todo', 7, 'completed', '2026-10-12'))).toBe('#7 · erledigt am 12.10.');
    expect(issueStateText(ticket('todo', 7, 'notPlanned', '2026-09-03'))).toBe('#7 · verworfen am 3.9.');
    expect(issueStateText(ticket('todo', 7, 'missing'))).toBe('#7 · nicht gefunden');
  });

  it('leaves out an unknown day or state', () => {
    expect(issueStateText(ticket('todo', 7, 'completed'))).toBe('#7 · erledigt');
    expect(issueStateText(ticket('todo', 7, 'notPlanned'))).toBe('#7 · verworfen');
    expect(issueStateText(ticket('todo', 7, null))).toBe('#7');
    expect(issueStateText(ticket('open'))).toBeNull();
  });
});
