import { describe, expect, it } from 'vitest';
import type { FeedbackContext, FeedbackDraft, FeedbackResult } from '../net/feedback';
import { type KeptReport, reportSignature } from '../net/feedback-reports';
import type { FeedbackDeleteResult, FeedbackInboxLike } from '../net/feedback-status';
import { type FeedbackBody, MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import { FeedbackFlow } from './feedback-flow';
import { de } from './i18n/de';


const CONTEXT: FeedbackContext = { platform: 'other', touch: false, portrait: false, viewWidth: 320, mode: 'title' };

/**
 * A fake sender: `prepare` makes a body from the draft (a new key each time, the log lines while
 * `lines` has some and the box counts), `send` records the body it got.
 */
function fakeSender(result: FeedbackResult = 'sent') {
  const bodies: FeedbackBody[] = [];
  /** What was sent, as the draft it came from. */
  const sent: FeedbackDraft[] = [];
  let resolve: (r: FeedbackResult) => void = () => {};
  let keys = 0;
  const sender = {
    hold: false,
    lines: ['error: x (a.js:1)'],
    get hasLog() {
      return sender.lines.length > 0;
    },
    prepare(draft: FeedbackDraft, context: FeedbackContext): FeedbackBody {
      const withLog = draft.kind === 'bug' && draft.withLog && sender.hasLog;
      return {
        session: 's'.repeat(32),
        kind: draft.kind,
        text: draft.text.trim(),
        version: '2026-10-11.10',
        platform: context.platform,
        input: context.touch ? 'touch' : 'keys',
        orientation: context.portrait ? 'portrait' : 'landscape',
        viewWidth: context.viewWidth,
        log: withLog ? [...sender.lines, `state: mode ${context.mode}`] : [],
        key: String(++keys).padStart(32, '0'),
      };
    },
    send(body: FeedbackBody) {
      bodies.push(body);
      sent.push({ kind: body.kind, text: body.text, withLog: body.log.length > 0 });
      if (sender.hold) return new Promise<FeedbackResult>((r) => (resolve = r));
      return Promise.resolve(result);
    },
  };
  return { sender, sent, bodies, finish: (r: FeedbackResult) => resolve(r) };
}

const kept = (id: number, extra: Partial<KeptReport> = {}): KeptReport => {
  const r = {
    id,
    key: 'k'.repeat(32),
    day: '2026-10-11',
    kind: 'bug',
    text: `Bericht ${id}`,
    version: '2026-10-11.10',
    platform: 'other',
    input: 'keys',
    orientation: 'landscape',
    viewWidth: 320,
    log: [],
    status: 'open',
    reply: null,
    doneVersion: null,
    ...extra,
  } as KeptReport;
  return { ...r, seen: extra.seen ?? reportSignature(r) };
};

/** A fake inbox over `reports` (newest first); markSeen clears the changes. */
function fakeInbox(reports: KeptReport[]) {
  const inbox = {
    reports,
    seenCalls: 0,
    get changed(): boolean {
      return inbox.changedIds().length > 0;
    },
    changedIds: (): number[] => reports.filter((r) => r.seen !== reportSignature(r)).map((r) => r.id),
    markSeen() {
      inbox.seenCalls++;
      for (const r of reports) r.seen = reportSignature(r);
    },
    checkIfDue: () => Promise.resolve(),
    /** The worker's answer to a delete; 'hold' waits for finishRemove. */
    answer: 'deleted' as FeedbackDeleteResult | 'hold',
    removed: [] as number[],
    finishRemove: (_r: FeedbackDeleteResult) => {},
    remove(id: number): Promise<FeedbackDeleteResult> {
      inbox.removed.push(id);
      const done = (r: FeedbackDeleteResult) => {
        if (r === 'deleted') reports.splice(reports.findIndex((k) => k.id === id), 1);
        return r;
      };
      if (inbox.answer === 'hold') return new Promise((resolve) => (inbox.finishRemove = (r) => resolve(done(r))));
      return Promise.resolve(done(inbox.answer));
    },
  } satisfies FeedbackInboxLike & Record<string, unknown>;
  return inbox;
}

describe('feedback flow', () => {
  it('opens on a bug report without the log ticked and an empty text', () => {
    const flow = new FeedbackFlow(fakeSender().sender, null);
    expect(flow.open).toBe(false);
    flow.openForm();
    expect(flow.open).toBe(true);
    expect(flow.kind).toBe('bug');
    expect(flow.withLog).toBe(false);
    expect(flow.text).toBe('');
    expect(flow.message).toBeNull();
  });

  it('sends only with at least MIN_FEEDBACK_TEXT characters after trimming', async () => {
    const { sender, sent } = fakeSender();
    const flow = new FeedbackFlow(sender, null);
    flow.openForm();
    flow.setText('  ab  ');
    expect(flow.canSend).toBe(false);
    await flow.send(CONTEXT);
    expect(sent).toHaveLength(0);
    expect(flow.message).toBe(de.feedback.short('3'));
    flow.setText('abc');
    expect(flow.canSend).toBe(true);
    expect(flow.message).toBeNull();
  });

  it('caps the text at MAX_FEEDBACK_TEXT', () => {
    const flow = new FeedbackFlow(fakeSender().sender, null);
    flow.setText('x'.repeat(MAX_FEEDBACK_TEXT + 10));
    expect(flow.text).toHaveLength(MAX_FEEDBACK_TEXT);
    expect(flow.counter).toBe(`${MAX_FEEDBACK_TEXT}/${MAX_FEEDBACK_TEXT}`);
  });

  it('the log box belongs to bug reports: an idea never sends it', async () => {
    const { sender, sent } = fakeSender();
    const flow = new FeedbackFlow(sender, null);
    flow.openForm();
    flow.toggleLog();
    expect(flow.withLog).toBe(true);
    flow.setKind('idea');
    expect(flow.logShown).toBe(false);
    flow.toggleLog();
    flow.setText('Mehr Strecken bitte');
    await flow.send(CONTEXT);
    expect(sent[0]).toEqual({ kind: 'idea', text: 'Mehr Strecken bitte', withLog: false });
  });

  it('a sent report keeps the dialog open: thanks on "Mein Feedback" with the new report on top, a fresh draft', async () => {
    const { sender, sent } = fakeSender('sent');
    const inbox = fakeInbox([kept(3)]);
    // The real sender keeps a stored report in the inbox before its answer comes back.
    const send = sender.send;
    sender.send = (body) => (inbox.reports.unshift(kept(9)), send(body));
    const flow = new FeedbackFlow(sender, inbox);
    flow.openForm();
    flow.toggleLog();
    flow.setText('Absturz im Tunnel');
    await flow.send(CONTEXT);
    expect(sent[0]).toEqual({ kind: 'bug', text: 'Absturz im Tunnel', withLog: true });
    expect(flow.open).toBe(true);
    expect([flow.tab, flow.page]).toEqual(['mine', 'list']);
    expect(flow.thanks).toBe(true);
    expect(flow.message).toBe(de.feedback.sent);
    expect(flow.rows.map((r) => [r.id, r.fresh])).toEqual([
      [9, true],
      [3, false],
    ]);
    expect([flow.kind, flow.text, flow.withLog]).toEqual(['bug', '', false]);
    // The player leaves themselves; "Neu" is a fresh form without the thanks.
    flow.showTab('new');
    expect([flow.tab, flow.page, flow.thanks, flow.message]).toEqual(['new', 'form', false, null]);
    flow.showTab('mine');
    expect(flow.rows.every((r) => !r.fresh)).toBe(true);
    flow.close();
    expect(flow.open).toBe(false);
  });

  it('the thanks stays while the player looks at the new report and back, and ends when the dialog closes', async () => {
    const inbox = fakeInbox([]);
    const { sender } = fakeSender('sent');
    const send = sender.send;
    sender.send = (body) => (inbox.reports.unshift(kept(4)), send(body));
    const flow = new FeedbackFlow(sender, inbox);
    flow.openForm();
    flow.setText('Mehr Musik');
    await flow.send(CONTEXT);
    flow.openReport(4);
    flow.back();
    expect([flow.page, flow.thanks, flow.rows[0]!.fresh]).toEqual(['list', true, true]);
    flow.close();
    flow.openForm();
    expect([flow.tab, flow.page, flow.thanks]).toEqual(['new', 'form', false]);
  });

  it('a report sent without a kept id (older worker) still thanks the player on the list', async () => {
    const flow = new FeedbackFlow(fakeSender('sent').sender, fakeInbox([kept(2)]));
    flow.openForm();
    flow.setText('Hallo du');
    await flow.send(CONTEXT);
    expect([flow.page, flow.thanks]).toEqual(['list', true]);
    expect(flow.rows.map((r) => r.fresh)).toEqual([false]);
  });

  it('a report sent after the dialog was dismissed leaves it closed with a fresh draft', async () => {
    const net = fakeSender();
    net.sender.hold = true;
    const flow = new FeedbackFlow(net.sender, null);
    flow.openForm();
    flow.setText('Unterwegs gesendet');
    const sending = flow.send(CONTEXT);
    flow.dismiss();
    net.finish('sent');
    await sending;
    expect(flow.open).toBe(false);
    flow.openForm();
    expect([flow.tab, flow.page, flow.text, flow.thanks]).toEqual(['new', 'form', '', false]);
  });

  it('rate limit and offline keep the text and say so', async () => {
    for (const [result, text] of [
      ['rate', de.feedback.rate],
      ['offline', de.feedback.offline],
      ['invalid', de.feedback.invalid],
    ] as const) {
      const flow = new FeedbackFlow(fakeSender(result).sender, null);
      flow.openForm();
      flow.setText('Bitte mehr Musik');
      await flow.send(CONTEXT);
      expect([flow.open, flow.tab, flow.page, flow.thanks], result).toEqual([true, 'new', 'form', false]);
      expect(flow.text, result).toBe('Bitte mehr Musik');
      expect(flow.message, result).toBe(text);
    }
  });

  it('sends once while a send is under way and cannot be closed meanwhile', async () => {
    const net = fakeSender();
    net.sender.hold = true;
    const flow = new FeedbackFlow(net.sender, null);
    flow.openForm();
    flow.setText('Doppelt?');
    const first = flow.send(CONTEXT);
    expect(flow.sending).toBe(true);
    expect(flow.message).toBe(de.feedback.sending);
    void flow.send(CONTEXT);
    flow.close();
    expect(flow.open).toBe(true);
    flow.setText('geändert');
    expect(flow.text).toBe('Doppelt?');
    net.finish('sent');
    await first;
    expect(net.sent).toHaveLength(1);
    expect([flow.page, flow.thanks]).toEqual(['list', true]);
  });

  it('cancel keeps the draft for this page load', () => {
    const flow = new FeedbackFlow(fakeSender().sender, null);
    flow.openForm();
    flow.setKind('idea');
    flow.setText('Ein Entwurf');
    flow.close();
    expect(flow.open).toBe(false);
    flow.openForm();
    expect(flow.text).toBe('Ein Entwurf');
    expect(flow.kind).toBe('idea');
  });
});

describe('feedback dialog tabs (ROADMAP 70)', () => {
  it('opens on "Neu" with the form; "Mein Feedback" shows the list, "Neu" the form again', () => {
    const flow = new FeedbackFlow(fakeSender().sender, fakeInbox([]));
    flow.openForm();
    expect([flow.tab, flow.page]).toEqual(['new', 'form']);
    flow.showTab('mine');
    expect([flow.tab, flow.page]).toEqual(['mine', 'list']);
    flow.showTab('new');
    expect([flow.tab, flow.page]).toEqual(['new', 'form']);
    flow.showTab('mine');
    flow.close();
    flow.openForm();
    expect([flow.tab, flow.page]).toEqual(['new', 'form']);
  });

  it('the tab dot shows changes until "Mein Feedback" is opened; the changed rows keep their dot while it shows', () => {
    const inbox = fakeInbox([kept(5, { status: 'done', seen: 'old' }), kept(3)]);
    const flow = new FeedbackFlow(fakeSender().sender, inbox);
    flow.openForm();
    expect(flow.dot).toBe(true);
    flow.showTab('mine');
    expect(flow.dot).toBe(false);
    expect(inbox.seenCalls).toBe(1);
    expect(flow.rows.map((r) => [r.id, r.changed])).toEqual([
      [5, true],
      [3, false],
    ]);
    flow.close();
    flow.openForm();
    flow.showTab('mine');
    expect(flow.rows.every((r) => !r.changed)).toBe(true);
  });

  it('a row opens its details; "Ansehen" there the sent message; "Zurück" walks back', () => {
    const inbox = fakeInbox([kept(5, { status: 'done', doneVersion: '2026-10-12.1', reply: 'Ist drin!' }), kept(3)]);
    const flow = new FeedbackFlow(fakeSender().sender, inbox);
    flow.openForm();
    flow.showTab('mine');
    flow.openReport(5);
    expect(flow.page).toBe('detail');
    expect(flow.detail?.headline).toBe('Umgesetzt in Version 2026-10-12.1');
    expect(flow.detail?.reply).toBe('Antwort: „Ist drin!“');
    flow.openSentLog();
    expect(flow.page).toBe('sent');
    expect(flow.sections.find((s) => s.label === 'Text')!.lines).toEqual(['Bericht 5']);
    expect(flow.back()).toBe(true);
    expect(flow.page).toBe('detail');
    expect(flow.back()).toBe(true);
    expect(flow.page).toBe('list');
    expect(flow.back()).toBe(false);
  });

  it('an unknown report opens nothing; no inbox means an empty list', () => {
    const flow = new FeedbackFlow(fakeSender().sender, null);
    flow.openForm();
    flow.showTab('mine');
    flow.openReport(9);
    expect(flow.page).toBe('list');
    expect(flow.rows).toEqual([]);
    expect(flow.dot).toBe(false);
  });

  it('a page starts at its top', () => {
    const flow = new FeedbackFlow(fakeSender().sender, fakeInbox([kept(1)]));
    flow.openForm();
    flow.showTab('mine');
    flow.scrollBy(40);
    expect(flow.scroll).toBe(40);
    flow.openReport(1);
    expect(flow.scroll).toBe(0);
  });
});

describe('"Ansehen": what is shown is what is sent (ROADMAP 70)', () => {
  it('takes a snapshot when opened, and "Senden" sends exactly that snapshot', async () => {
    const net = fakeSender();
    const flow = new FeedbackFlow(net.sender, null);
    flow.openForm();
    flow.setText('Hängt im Tunnel');
    flow.toggleLog();
    flow.openPreview(CONTEXT);
    expect(flow.page).toBe('preview');
    const shown = flow.preview!;
    expect(flow.sections.find((s) => s.label === 'Fehlerprotokoll')!.lines).toEqual(shown.log);
    // New errors after opening and another mode at send time change nothing.
    net.sender.lines.push('error: later (b.js:2)');
    flow.back();
    expect(flow.page).toBe('form');
    await flow.send({ ...CONTEXT, mode: 'paused' });
    expect(net.bodies).toEqual([shown]);
  });

  it('a draft changed after "Ansehen" is sent as it is then (a fresh snapshot)', async () => {
    const net = fakeSender();
    const flow = new FeedbackFlow(net.sender, null);
    flow.openForm();
    flow.setText('Erster Text');
    flow.openPreview(CONTEXT);
    flow.back();
    flow.setText('Zweiter Text');
    await flow.send(CONTEXT);
    expect(net.bodies[0]!.text).toBe('Zweiter Text');
  });

  it('with nothing recorded the log box cannot be ticked and the preview says so', () => {
    const net = fakeSender();
    net.sender.lines = [];
    const flow = new FeedbackFlow(net.sender, null);
    flow.openForm();
    expect(flow.logAvailable).toBe(false);
    flow.toggleLog();
    expect(flow.withLog).toBe(false);
    flow.setText('Kein Protokoll');
    flow.openPreview(CONTEXT);
    expect(flow.sections.find((s) => s.label === 'Fehlerprotokoll')!.lines).toEqual(['Keine Fehler aufgezeichnet']);
  });

  it('the preview shows the session id line; an idea has no log line', () => {
    const flow = new FeedbackFlow(fakeSender().sender, null);
    flow.openForm();
    flow.setKind('idea');
    flow.setText('Mehr Brezeln');
    flow.openPreview(CONTEXT);
    const labels = flow.sections.map((s) => s.label);
    expect(labels).toContain('Sitzungsnummer (nur gegen Spam, wird nicht gespeichert)');
    expect(labels).not.toContain('Fehlerprotokoll');
  });
});

describe('deleting an own report (ROADMAP 78)', () => {
  const onDetail = (inbox: ReturnType<typeof fakeInbox>) => {
    const flow = new FeedbackFlow(fakeSender().sender, inbox);
    flow.openForm();
    flow.showTab('mine');
    flow.openReport(3);
    return flow;
  };

  it('"Löschen" on the details asks first; "Abbrechen" and back return to the details', () => {
    const inbox = fakeInbox([kept(5), kept(3)]);
    const flow = onDetail(inbox);
    flow.askDelete();
    expect(flow.page).toBe('confirm');
    expect(flow.report?.id).toBe(3);
    expect(flow.deleteMessage).toBeNull();
    expect(flow.back()).toBe(true);
    expect(flow.page).toBe('detail');
    expect(inbox.removed).toEqual([]);
  });

  it('asks only from a report\'s details', () => {
    const flow = new FeedbackFlow(fakeSender().sender, fakeInbox([kept(3)]));
    flow.openForm();
    flow.askDelete();
    expect(flow.page).toBe('form');
    flow.showTab('mine');
    flow.askDelete();
    expect(flow.page).toBe('list');
  });

  it('"Ja, löschen": the report is gone, the list shows with "Feedback gelöscht" until the player moves on', async () => {
    const inbox = fakeInbox([kept(5), kept(3)]);
    const flow = onDetail(inbox);
    flow.askDelete();
    await flow.confirmDelete();
    expect(inbox.removed).toEqual([3]);
    expect([flow.tab, flow.page, flow.listNote]).toEqual(['mine', 'list', de.feedbackPages.deleted]);
    expect(flow.rows.map((r) => r.id)).toEqual([5]);
    flow.openReport(5);
    flow.back();
    expect(flow.listNote).toBeNull();
  });

  it('offline or refused: the report stays, the confirm shows why, and "Ja, löschen" may try again', async () => {
    const inbox = fakeInbox([kept(3)]);
    const flow = onDetail(inbox);
    flow.askDelete();
    inbox.answer = 'offline';
    await flow.confirmDelete();
    expect([flow.page, flow.deleteMessage]).toEqual(['confirm', de.feedback.offline]);
    inbox.answer = 'failed';
    await flow.confirmDelete();
    expect([flow.page, flow.deleteMessage]).toEqual(['confirm', de.feedbackPages.deleteFailed]);
    expect(flow.rows.map((r) => r.id)).toEqual([3]);
    flow.back();
    flow.askDelete();
    expect(flow.deleteMessage).toBeNull();
  });

  it('while it deletes: one request, back and close wait, the message says so', async () => {
    const inbox = fakeInbox([kept(3)]);
    inbox.answer = 'hold';
    const flow = onDetail(inbox);
    flow.askDelete();
    const deleting = flow.confirmDelete();
    void flow.confirmDelete();
    expect(flow.deleteMessage).toBe(de.feedbackPages.deleting);
    expect(flow.back()).toBe(true);
    flow.close();
    expect([flow.open, flow.page]).toEqual([true, 'confirm']);
    inbox.finishRemove('deleted');
    await deleting;
    expect(inbox.removed).toEqual([3]);
    expect([flow.page, flow.listNote]).toEqual(['list', de.feedbackPages.deleted]);
  });

  it('the note after deleting wins over the thanks of a just sent report', async () => {
    const inbox = fakeInbox([kept(3)]);
    const { sender } = fakeSender('sent');
    const send = sender.send;
    sender.send = (body) => (inbox.reports.unshift(kept(4)), send(body));
    const flow = new FeedbackFlow(sender, inbox);
    flow.openForm();
    flow.setText('Mehr Musik');
    await flow.send(CONTEXT);
    expect(flow.listNote).toBe(de.feedback.sent);
    flow.openReport(4);
    flow.askDelete();
    await flow.confirmDelete();
    expect(flow.listNote).toBe(de.feedbackPages.deleted);
  });
});
