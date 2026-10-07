import { describe, expect, it } from 'vitest';
import { createStore, type Store } from '../core/storage';
import { loadRecords, recordRun, saveRecords } from './records';

function memoryStore(initial: Record<string, string> = {}): Store {
  const data = new Map(Object.entries(initial));
  return createStore({
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage);
}

describe('records', () => {
  it('starts at zero without stored values or without storage', () => {
    expect(loadRecords(memoryStore())).toEqual({ highscore: 0, starsTotal: 0 });
    expect(loadRecords(createStore(null))).toEqual({ highscore: 0, starsTotal: 0 });
  });

  it('ignores corrupt stored values', () => {
    const store = memoryStore({ 'cannstatt-cruiser:highscore': '"viel"', 'cannstatt-cruiser:starsTotal': '-3' });
    expect(loadRecords(store)).toEqual({ highscore: 0, starsTotal: 0 });
  });

  it('round-trips through the store', () => {
    const store = memoryStore();
    saveRecords(store, { highscore: 4200, starsTotal: 17 });
    expect(loadRecords(store)).toEqual({ highscore: 4200, starsTotal: 17 });
  });

  it('detects a new record and adds the run stars to the total', () => {
    const result = recordRun({ highscore: 1000, starsTotal: 5 }, { score: 1500, stars: 3 });
    expect(result).toEqual({ records: { highscore: 1500, starsTotal: 8 }, newRecord: true, previousHighscore: 1000 });
  });

  it('keeps the highscore when the run is not better (a tie is no record)', () => {
    expect(recordRun({ highscore: 1000, starsTotal: 5 }, { score: 1000, stars: 0 })).toEqual({
      records: { highscore: 1000, starsTotal: 5 },
      newRecord: false,
      previousHighscore: 1000,
    });
  });

  it('does not celebrate a zero-point run as a record', () => {
    expect(recordRun({ highscore: 0, starsTotal: 0 }, { score: 0, stars: 0 }).newRecord).toBe(false);
  });
});
