import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import type { ScoreSubmission } from './api';
import { PENDING_KEY, ScoreQueue } from './queue';

const run = (score: number, name = 'Max'): ScoreSubmission => ({
  name,
  score,
  distance: 100,
  duration: 30,
  version: '2026-10-09.3',
  device: 'device-1234',
});

describe('ScoreQueue', () => {
  it('starts empty', () => {
    expect(new ScoreQueue(createMemoryStore()).pending).toBeNull();
  });

  it('keeps only the best pending entry', () => {
    const queue = new ScoreQueue(createMemoryStore());
    queue.keep(run(500));
    queue.keep(run(300, 'Low'));
    expect(queue.pending).toEqual(run(500));
    queue.keep(run(900, 'High'));
    expect(queue.pending).toEqual(run(900, 'High'));
  });

  it('survives a reload through the store and can be cleared', () => {
    const store = createMemoryStore();
    new ScoreQueue(store).keep(run(700));
    const again = new ScoreQueue(store);
    expect(again.pending).toEqual(run(700));
    again.clear();
    expect(new ScoreQueue(store).pending).toBeNull();
  });

  it('ignores junk in the store', () => {
    const store = createMemoryStore();
    store.set(PENDING_KEY, { name: 3, score: 'x' });
    expect(new ScoreQueue(store).pending).toBeNull();
    store.set(PENDING_KEY, 'nonsense');
    expect(new ScoreQueue(store).pending).toBeNull();
  });
});
