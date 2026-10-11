import { describe, expect, it } from 'vitest';
import type { FeedbackContext, FeedbackDraft, FeedbackResult } from '../net/feedback';
import { MAX_FEEDBACK_TEXT } from '../net/feedback-types';
import { FEEDBACK_TEXT, FeedbackFlow } from './feedback-flow';

const CONTEXT: FeedbackContext = { platform: 'other', touch: false, portrait: false, viewWidth: 320, mode: 'title' };

function fakeSender(result: FeedbackResult = 'sent') {
  const sent: FeedbackDraft[] = [];
  let resolve: (r: FeedbackResult) => void = () => {};
  const sender = {
    hold: false,
    send(draft: FeedbackDraft) {
      sent.push({ ...draft });
      if (sender.hold) return new Promise<FeedbackResult>((r) => (resolve = r));
      return Promise.resolve(result);
    },
  };
  return { sender, sent, finish: (r: FeedbackResult) => resolve(r) };
}

describe('feedback flow', () => {
  it('opens on a bug report without the log ticked and an empty text', () => {
    const flow = new FeedbackFlow(fakeSender().sender);
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
    const flow = new FeedbackFlow(sender);
    flow.openForm();
    flow.setText('  ab  ');
    expect(flow.canSend).toBe(false);
    await flow.send(CONTEXT);
    expect(sent).toHaveLength(0);
    expect(flow.message).toBe(FEEDBACK_TEXT.short);
    flow.setText('abc');
    expect(flow.canSend).toBe(true);
    expect(flow.message).toBeNull();
  });

  it('caps the text at MAX_FEEDBACK_TEXT', () => {
    const flow = new FeedbackFlow(fakeSender().sender);
    flow.setText('x'.repeat(MAX_FEEDBACK_TEXT + 10));
    expect(flow.text).toHaveLength(MAX_FEEDBACK_TEXT);
    expect(flow.counter).toBe(`${MAX_FEEDBACK_TEXT}/${MAX_FEEDBACK_TEXT}`);
  });

  it('the log box belongs to bug reports: an idea never sends it', async () => {
    const { sender, sent } = fakeSender();
    const flow = new FeedbackFlow(sender);
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

  it('a sent report thanks the player and starts fresh next time', async () => {
    const { sender, sent } = fakeSender('sent');
    const flow = new FeedbackFlow(sender);
    flow.openForm();
    flow.toggleLog();
    flow.setText('Absturz im Tunnel');
    await flow.send(CONTEXT);
    expect(sent[0]).toEqual({ kind: 'bug', text: 'Absturz im Tunnel', withLog: true });
    expect(flow.done).toBe(true);
    expect(flow.message).toBe(FEEDBACK_TEXT.sent);
    flow.close();
    flow.openForm();
    expect(flow.done).toBe(false);
    expect(flow.text).toBe('');
    expect(flow.withLog).toBe(false);
  });

  it('rate limit and offline keep the text and say so', async () => {
    for (const [result, text] of [
      ['rate', FEEDBACK_TEXT.rate],
      ['offline', FEEDBACK_TEXT.offline],
      ['invalid', FEEDBACK_TEXT.invalid],
    ] as const) {
      const flow = new FeedbackFlow(fakeSender(result).sender);
      flow.openForm();
      flow.setText('Bitte mehr Musik');
      await flow.send(CONTEXT);
      expect(flow.done, result).toBe(false);
      expect(flow.text, result).toBe('Bitte mehr Musik');
      expect(flow.message, result).toBe(text);
    }
  });

  it('sends once while a send is under way and cannot be closed meanwhile', async () => {
    const net = fakeSender();
    net.sender.hold = true;
    const flow = new FeedbackFlow(net.sender);
    flow.openForm();
    flow.setText('Doppelt?');
    const first = flow.send(CONTEXT);
    expect(flow.sending).toBe(true);
    expect(flow.message).toBe(FEEDBACK_TEXT.sending);
    void flow.send(CONTEXT);
    flow.close();
    expect(flow.open).toBe(true);
    flow.setText('geändert');
    expect(flow.text).toBe('Doppelt?');
    net.finish('sent');
    await first;
    expect(net.sent).toHaveLength(1);
    expect(flow.done).toBe(true);
  });

  it('cancel keeps the draft for this page load', () => {
    const flow = new FeedbackFlow(fakeSender().sender);
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
