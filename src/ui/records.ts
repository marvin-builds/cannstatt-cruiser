import type { Store } from '../core/storage';

/**
 * Persistent bests across runs (keys `highscore`, `kidHighscore` and
 * `starsTotal`, see docs/ARCHITECTURE.md). Kid mode keeps its own record
 * (its runs have different content); the star total is shared.
 */
export interface Records {
  /** The adult mode record. */
  highscore: number;
  /** The kid mode record. */
  kidHighscore: number;
  starsTotal: number;
}

export interface RunResult {
  records: Records;
  /** The run beat the previous record of its mode (ties and zero-point runs do not count). */
  newRecord: boolean;
  previousHighscore: number;
  /** The run was played in kid mode. */
  kid: boolean;
}

const HIGHSCORE_KEY = 'highscore';
const KID_HIGHSCORE_KEY = 'kidHighscore';
const STARS_TOTAL_KEY = 'starsTotal';

/** A stored value as a non-negative whole number; anything else (corrupt, foreign) counts as 0. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function loadRecords(store: Store): Records {
  return {
    highscore: count(store.get(HIGHSCORE_KEY, 0)),
    kidHighscore: count(store.get(KID_HIGHSCORE_KEY, 0)),
    starsTotal: count(store.get(STARS_TOTAL_KEY, 0)),
  };
}

export function saveRecords(store: Store, records: Records): void {
  store.set(HIGHSCORE_KEY, records.highscore);
  store.set(KID_HIGHSCORE_KEY, records.kidHighscore);
  store.set(STARS_TOTAL_KEY, records.starsTotal);
}

/** The record of the given mode. */
export function bestOf(records: Records, kid: boolean): number {
  return kid ? records.kidHighscore : records.highscore;
}

/** Folds a finished run, played in kid mode or not, into the records. Pure: the caller persists the result. */
export function recordRun(previous: Records, run: { score: number; stars: number }, kid: boolean): RunResult {
  const score = count(run.score);
  const previousHighscore = bestOf(previous, kid);
  const newRecord = score > previousHighscore;
  const best = newRecord ? score : previousHighscore;
  return {
    records: {
      highscore: kid ? previous.highscore : best,
      kidHighscore: kid ? best : previous.kidHighscore,
      starsTotal: previous.starsTotal + count(run.stars),
    },
    newRecord,
    previousHighscore,
    kid,
  };
}
