import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import type { ScoreEntry, ScoreSubmission } from '../net/api';
import type { SubmitOutcome } from '../net/service';
import { HighscoreFlow, SCORE_TEXT, type ScoreServiceLike } from './highscore-flow';
import { submitButtonLabel } from './score-screens';
import { loadLastEntry, loadName, saveName } from './score-rules';

const entry = (rank: number, name: string, score: number): ScoreEntry => ({ rank, name, score, distance: 100, date: '2026-10-09T10:00:00.000Z' });
const RUN = { score: 1500, distance: 4000, seconds: 50 };

function setup() {
  const sent: { name: string; score: number }[] = [];
  const outcomes: SubmitOutcome[] = [];
  let refreshes = 0;
  let retries = 0;
  // A plain object, so tests can set what the real service computes (pending is a getter there).
  const service: Omit<ScoreServiceLike, 'pending'> & { pending: ScoreSubmission | null } = {
    top: null,
    topState: 'idle',
    pending: null,
    async refreshTop() {
      refreshes++;
    },
    async submit(run, name) {
      sent.push({ name, score: run.score });
      const outcome = outcomes.shift() ?? { kind: 'ok', rank: 1, entries: [entry(1, name, run.score)] };
      // Like ScoreService: an accepted run brings the new list along.
      if (outcome.kind === 'ok') service.top = outcome.entries;
      return outcome;
    },
    async retryPending() {
      retries++;
    },
  };
  const store = createMemoryStore();
  const flow = new HighscoreFlow({ service, store });
  return { flow, service, store, sent, outcomes, refreshes: () => refreshes, retries: () => retries };
}

describe('HighscoreFlow: Eintragen offer', () => {
  it('fetches the list in the background when a run starts', () => {
    const { flow, refreshes } = setup();
    flow.runStarted(true);
    expect(refreshes()).toBe(1);
  });

  it('a run without the online list (kid mode) forgets the last run but fetches nothing', () => {
    const { flow, refreshes } = setup();
    flow.runEnded(RUN);
    expect(flow.offered).toBe(true);
    flow.runStarted(false);
    expect(flow.offered).toBe(false);
    expect(refreshes()).toBe(0);
  });

  it('offers Eintragen only for a run that makes the list', () => {
    const { flow, service } = setup();
    expect(flow.offered).toBe(false);
    service.top = Array.from({ length: 20 }, (_, i) => entry(i + 1, `P${i}`, 3000 - i * 100));
    flow.runEnded({ ...RUN, score: 1000 });
    expect(flow.offered).toBe(false);
    flow.runEnded({ ...RUN, score: 1200 });
    expect(flow.offered).toBe(true);
    flow.runStarted(true);
    expect(flow.offered).toBe(false);
  });

  it('offers it offline (no list known), the run is then queued', async () => {
    const { flow, outcomes } = setup();
    flow.runEnded(RUN);
    expect(flow.offered).toBe(true);
    flow.openEntry();
    flow.setName('Max');
    outcomes.push({ kind: 'queued', reason: 'offline' });
    await flow.submit();
    expect(flow.message).toBe(SCORE_TEXT.queued);
    expect(flow.screen).toBe('list');
    expect(flow.offered).toBe(false);
  });
});

describe('HighscoreFlow: name entry', () => {
  it('starts empty the first time and with the remembered name later', () => {
    const { flow, store } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    expect(flow.screen).toBe('entry');
    expect(flow.name).toBe('');
    expect(flow.canSubmit).toBe(false);
    flow.close();
    saveName(store, 'Max');
    flow.openEntry();
    expect(flow.name).toBe('Max');
    expect(flow.canSubmit).toBe(true);
  });

  it('typing keeps only allowed characters', () => {
    const { flow } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    flow.setName('Mäx@<1>');
    expect(flow.name).toBe('Mäx1');
  });

  it('a submit with a bad name sends nothing and says why', async () => {
    const { flow, sent } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    flow.setName('M');
    await flow.submit();
    expect(sent).toHaveLength(0);
    expect(flow.message).toBe(SCORE_TEXT.short);
  });

  it('success: remembers the name and entry, shows the list with the own entry', async () => {
    const { flow, store, sent, outcomes } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    flow.setName('  Max   Muster ');
    outcomes.push({ kind: 'ok', rank: 3, entries: [entry(1, 'A', 9000), entry(2, 'B', 2000), entry(3, 'Max Muster', 1500)] });
    const pending = flow.submit();
    expect(flow.sending).toBe(true);
    expect(flow.canSubmit).toBe(false);
    await pending;
    expect(sent).toEqual([{ name: 'Max Muster', score: 1500 }]);
    expect(flow.screen).toBe('list');
    expect(flow.highlight).toBe(3);
    expect(flow.entries.map((e) => e.name)).toEqual(['A', 'B', 'Max Muster']);
    expect(loadName(store)).toBe('Max Muster');
    expect(loadLastEntry(store)).toEqual({ name: 'Max Muster', score: 1500 });
    expect(flow.offered).toBe(false);
  });

  it.each([
    ['name', SCORE_TEXT.badName],
    ['rate', SCORE_TEXT.rate],
    ['implausible', SCORE_TEXT.failed],
    ['bad-request', SCORE_TEXT.failed],
  ] as const)('server answer %s stays on the entry with a message', async (error, message) => {
    const { flow, outcomes } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    flow.setName('Max');
    outcomes.push({ kind: 'failed', error });
    await flow.submit();
    expect(flow.screen).toBe('entry');
    expect(flow.message).toBe(message);
    expect(flow.sending).toBe(false);
    expect(flow.offered).toBe(true);
  });

  it('a server error queues the run like offline', async () => {
    const { flow, outcomes } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    flow.setName('Max');
    outcomes.push({ kind: 'queued', reason: 'server' });
    await flow.submit();
    expect(flow.screen).toBe('list');
    expect(flow.message).toBe(SCORE_TEXT.queuedLater);
  });

  it('cancel closes without sending', () => {
    const { flow, sent } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    flow.close();
    expect(flow.screen).toBe('closed');
    expect(sent).toHaveLength(0);
    expect(flow.offered).toBe(true);
  });
});

describe('HighscoreFlow: submit label', () => {
  it('says "Als <Name> eintragen" once the name is valid, else just "Eintragen"', () => {
    const { flow } = setup();
    flow.runEnded(RUN);
    flow.openEntry();
    expect(submitButtonLabel(flow)).toBe(SCORE_TEXT.submit);
    flow.setName('Mia');
    expect(submitButtonLabel(flow)).toBe('Als Mia eintragen');
  });
});

describe('HighscoreFlow: the list', () => {
  it('opening it refreshes the list, retries the queue and highlights the last own entry', () => {
    const { flow, service, store, refreshes, retries } = setup();
    store.set('scoreLastEntry', { name: 'B', score: 2000 });
    service.top = [entry(1, 'A', 9000), entry(2, 'B', 2000)];
    flow.openList();
    expect(flow.screen).toBe('list');
    expect(refreshes()).toBe(1);
    expect(retries()).toBe(1);
    expect(flow.highlight).toBe(2);
    expect(flow.message).toBeNull();
    flow.close();
    expect(flow.screen).toBe('closed');
  });

  it('shows the queued note while a run waits to be sent', () => {
    const { flow, service } = setup();
    service.pending = { name: 'Max', score: 1, distance: 1, duration: 1, version: 'v', device: 'device-1234' };
    flow.openList();
    expect(flow.message).toBe(SCORE_TEXT.queued);
  });

  it('scrolls and remembers the request to show the own entry', () => {
    const { flow } = setup();
    flow.openList();
    flow.scrollBy(30);
    expect(flow.scroll).toBe(30);
    flow.scrollBy(-100);
    expect(flow.scroll).toBe(0);
    flow.clampScroll(20);
    flow.scrollBy(50);
    flow.clampScroll(20);
    expect(flow.scroll).toBe(20);
  });
});
