import type { Store } from '../core/storage';

/** Persistent bests across runs (keys `highscore` and `starsTotal`, see docs/ARCHITECTURE.md). */
export interface Records {
  highscore: number;
  starsTotal: number;
}

export interface RunResult {
  records: Records;
  /** The run beat the previous highscore (ties and zero-point runs do not count). */
  newRecord: boolean;
  previousHighscore: number;
}

const HIGHSCORE_KEY = 'highscore';
const STARS_TOTAL_KEY = 'starsTotal';

/** A stored value as a non-negative whole number; anything else (corrupt, foreign) counts as 0. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function loadRecords(store: Store): Records {
  return { highscore: count(store.get(HIGHSCORE_KEY, 0)), starsTotal: count(store.get(STARS_TOTAL_KEY, 0)) };
}

export function saveRecords(store: Store, records: Records): void {
  store.set(HIGHSCORE_KEY, records.highscore);
  store.set(STARS_TOTAL_KEY, records.starsTotal);
}

/** Folds a finished run into the records. Pure: the caller persists the result. */
export function recordRun(previous: Records, run: { score: number; stars: number }): RunResult {
  const score = count(run.score);
  const newRecord = score > previous.highscore;
  return {
    records: {
      highscore: newRecord ? score : previous.highscore,
      starsTotal: previous.starsTotal + count(run.stars),
    },
    newRecord,
    previousHighscore: previous.highscore,
  };
}
