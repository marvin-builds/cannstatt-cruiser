/**
 * The offline queue: a run that could not be sent waits in the store (key
 * `pendingScore`) until the page is online again. Only the best pending run
 * is kept; the server rate-limits a device to one run per SEND_SPACING_MS.
 */
import type { Store } from '../core/storage';
import type { ScoreSubmission } from './api';

export const PENDING_KEY = 'pendingScore';
/** At most one send per 20 s (the server's rate limit per device). */
export const SEND_SPACING_MS = 20_000;

function isSubmission(v: unknown): v is ScoreSubmission {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.name === 'string' &&
    typeof s.version === 'string' &&
    typeof s.device === 'string' &&
    [s.score, s.distance, s.duration].every((n) => typeof n === 'number' && Number.isInteger(n))
  );
}

export class ScoreQueue {
  constructor(private readonly store: Store) {}

  get pending(): ScoreSubmission | null {
    const stored = this.store.get<unknown>(PENDING_KEY, null);
    return isSubmission(stored) ? stored : null;
  }

  /** Keeps `run` unless a better one is already waiting. */
  keep(run: ScoreSubmission): void {
    const waiting = this.pending;
    if (!waiting || run.score > waiting.score) this.store.set(PENDING_KEY, run);
  }

  clear(): void {
    this.store.set(PENDING_KEY, null);
  }
}
