import { describe, expect, it } from 'vitest';
import { createStore, type Store } from '../core/storage';
import { bestOf, loadRecords, recordRun, saveRecords } from './records';

function memoryStore(initial: Record<string, string> = {}): Store {
  const data = new Map(Object.entries(initial));
  return createStore({
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage);
}

const ZERO = { highscore: 0, kidHighscore: 0, starsTotal: 0 };

describe('records', () => {
  it('starts at zero without stored values or without storage', () => {
    expect(loadRecords(memoryStore())).toEqual(ZERO);
    expect(loadRecords(createStore(null))).toEqual(ZERO);
  });

  it('ignores corrupt stored values', () => {
    const store = memoryStore({
      'cannstatt-cruiser:highscore': '"viel"',
      'cannstatt-cruiser:kidHighscore': 'null',
      'cannstatt-cruiser:starsTotal': '-3',
    });
    expect(loadRecords(store)).toEqual(ZERO);
  });

  it('round-trips through the store under separate adult and kid keys', () => {
    const store = memoryStore();
    saveRecords(store, { highscore: 4200, kidHighscore: 900, starsTotal: 17 });
    expect(loadRecords(store)).toEqual({ highscore: 4200, kidHighscore: 900, starsTotal: 17 });
    expect(store.get('highscore', 0)).toBe(4200);
    expect(store.get('kidHighscore', 0)).toBe(900);
  });

  it('keeps an existing stored highscore as the adult record; the kid record starts at 0', () => {
    const store = memoryStore({ 'cannstatt-cruiser:highscore': '7000', 'cannstatt-cruiser:starsTotal': '40' });
    const records = loadRecords(store);
    expect(records).toEqual({ highscore: 7000, kidHighscore: 0, starsTotal: 40 });
    expect(bestOf(records, false)).toBe(7000);
    expect(bestOf(records, true)).toBe(0);
  });

  it('detects a new record and adds the run stars to the total', () => {
    const result = recordRun({ highscore: 1000, kidHighscore: 0, starsTotal: 5 }, { score: 1500, stars: 3 }, false);
    expect(result).toEqual({
      records: { highscore: 1500, kidHighscore: 0, starsTotal: 8 },
      newRecord: true,
      previousHighscore: 1000,
      kid: false,
    });
  });

  it('a kid run counts against and updates only the kid record; the star total is shared', () => {
    const previous = { highscore: 5000, kidHighscore: 800, starsTotal: 5 };
    const result = recordRun(previous, { score: 1200, stars: 2 }, true);
    expect(result).toEqual({
      records: { highscore: 5000, kidHighscore: 1200, starsTotal: 7 },
      newRecord: true,
      previousHighscore: 800,
      kid: true,
    });
    const adult = recordRun(previous, { score: 1200, stars: 2 }, false);
    expect(adult.newRecord).toBe(false);
    expect(adult.records).toEqual({ highscore: 5000, kidHighscore: 800, starsTotal: 7 });
  });

  it('keeps the highscore when the run is not better (a tie is no record)', () => {
    expect(recordRun({ highscore: 1000, kidHighscore: 0, starsTotal: 5 }, { score: 1000, stars: 0 }, false)).toEqual({
      records: { highscore: 1000, kidHighscore: 0, starsTotal: 5 },
      newRecord: false,
      previousHighscore: 1000,
      kid: false,
    });
  });

  it('does not celebrate a zero-point run as a record', () => {
    expect(recordRun(ZERO, { score: 0, stars: 0 }, false).newRecord).toBe(false);
    expect(recordRun(ZERO, { score: 0, stars: 0 }, true).newRecord).toBe(false);
  });
});
