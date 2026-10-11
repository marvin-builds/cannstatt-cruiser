/**
 * The highscore service the ui talks to: the last fetched top list, the
 * device's own online entry (one row per device: its best run), run
 * submission and the offline queue (queue.ts). Never blocks: every call
 * returns a promise the caller may ignore. Clock, connectivity and timers are
 * passed in, so tests run without a browser and without the network.
 */
import type { Store } from '../core/storage';
import type { OwnEntry, ScoreEntry, ScoreSubmission, ScoresApi, SubmitResult } from './api';
import { type RunStats, scorePayload } from './payload';
import { ScoreQueue, SEND_SPACING_MS } from './queue';

/** Store key: the device's own online best (a number; 0 or absent = no entry), known offline and before the list loads. */
export const OWN_BEST_KEY = 'scoreOwnBest';

/** idle: never asked; offline: the last attempt found no connection (an older list may still be kept). */
export type TopState = 'idle' | 'loading' | 'ready' | 'offline';

export type SubmitOutcome =
  /** Accepted; `stored` false when the run did not beat the device's row (`best` is that row's score). */
  | { kind: 'ok'; stored: boolean; rank: number | null; best: number; entries: ScoreEntry[] }
  /** Kept in the offline queue, sent later. */
  | { kind: 'queued'; reason: 'offline' | 'server' }
  /** Refused by the server; a 'rate' refusal may be retried by the player a little later. */
  | { kind: 'failed'; error: 'name' | 'implausible' | 'rate' | 'bad-request' };

export interface ScoreServiceOptions {
  api: Pick<ScoresApi, 'top' | 'submit'>;
  store: Store;
  /** BUILD_VERSION. */
  version: string;
  device: string;
  /** Milliseconds (Date.now). */
  now: () => number;
  /** navigator.onLine: false skips the request. */
  online: () => boolean;
  /** setTimeout. */
  schedule: (fn: () => void, ms: number) => void;
}

export class ScoreService {
  top: ScoreEntry[] | null = null;
  topState: TopState = 'idle';
  /** The own row's place in `top`, or null (outside the top 20, no row, or not known). */
  ownRank: number | null = null;
  private best: number;
  private readonly queue: ScoreQueue;
  private lastSend = -Infinity;
  private retryScheduled = false;
  private sending = false;

  constructor(private readonly options: ScoreServiceOptions) {
    this.queue = new ScoreQueue(options.store);
    const stored = options.store.get<unknown>(OWN_BEST_KEY, 0);
    this.best = typeof stored === 'number' && Number.isInteger(stored) && stored > 0 ? stored : 0;
  }

  /** The device's own online best (0 = no entry), the freshest the server told. */
  get ownBest(): number {
    return this.best;
  }

  /** The run waiting in the offline queue, or null. */
  get pending(): ScoreSubmission | null {
    return this.queue.pending;
  }

  /** Fetches the top list; on failure the last list is kept and topState says offline. */
  async refreshTop(): Promise<void> {
    if (!this.options.online()) {
      this.topState = 'offline';
      return;
    }
    this.topState = 'loading';
    const result = await this.options.api.top(this.options.device);
    if (!result.ok) {
      this.topState = 'offline';
      return;
    }
    this.setTop(result.entries);
    if (result.own !== undefined) this.setOwn(result.own);
  }

  /** Sends a run under `name`; offline or on a server error it goes into the queue instead. */
  async submit(run: RunStats, name: string): Promise<SubmitOutcome> {
    const payload = scorePayload(run, name, this.options.version, this.options.device);
    if (!this.options.online()) {
      this.queue.keep(payload);
      return { kind: 'queued', reason: 'offline' };
    }
    const result = await this.send(payload);
    if (result.ok) return { kind: 'ok', stored: result.stored, rank: result.rank, best: result.best, entries: result.entries };
    if (result.error === 'offline' || result.error === 'server') {
      this.queue.keep(payload);
      return { kind: 'queued', reason: result.error };
    }
    return { kind: 'failed', error: result.error };
  }

  /**
   * Sends the queued run when online, at most one send per SEND_SPACING_MS
   * (asked too soon, it retries once the spacing allows). Accepted or refused
   * for good, it leaves the queue; offline, a server error or the rate limit
   * keep it for the next try.
   */
  async retryPending(): Promise<void> {
    const pending = this.queue.pending;
    if (!pending || this.sending || !this.options.online()) return;
    const wait = this.lastSend + SEND_SPACING_MS - this.options.now();
    if (wait > 0) {
      this.scheduleRetry(wait);
      return;
    }
    const result = await this.send(pending);
    if (result.ok || (result.error !== 'offline' && result.error !== 'server' && result.error !== 'rate')) this.queue.clear();
  }

  private async send(payload: ScoreSubmission): Promise<SubmitResult> {
    this.sending = true;
    this.lastSend = this.options.now();
    try {
      const result = await this.options.api.submit(payload);
      if (result.ok) {
        this.setTop(result.entries);
        this.setOwn({ rank: result.rank, score: result.best });
      }
      return result;
    } finally {
      this.sending = false;
    }
  }

  private scheduleRetry(ms: number): void {
    if (this.retryScheduled) return;
    this.retryScheduled = true;
    this.options.schedule(() => {
      this.retryScheduled = false;
      void this.retryPending();
    }, ms);
  }

  private setTop(entries: ScoreEntry[]): void {
    this.top = entries;
    this.topState = 'ready';
  }

  /** A fresher server answer about the own row always replaces what was known (null = no row). */
  private setOwn(own: OwnEntry | null): void {
    this.ownRank = own?.rank ?? null;
    this.best = own?.score ?? 0;
    this.options.store.set(OWN_BEST_KEY, this.best);
  }
}
