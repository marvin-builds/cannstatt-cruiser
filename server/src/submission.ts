/**
 * Parses and checks a POST /score body. Order: shape (bad-request), then the
 * name rules and word filter (name), then the run's plausibility.
 */
import { normalizeName } from './name';
import { isPlausible } from './plausibility';
import { isOffensive } from './word-filter';

export interface Submission {
  name: string;
  /** Points. */
  score: number;
  /** Metres. */
  distance: number;
  /** Seconds of play. */
  duration: number;
  /** Game build string, e.g. "2026-10-08.3". */
  version: string;
  /** Random client id; only its SHA-256 is stored. */
  device: string;
}

export type SubmissionError = 'bad-request' | 'name' | 'implausible';
export type Parsed = { ok: true; value: Submission } | { ok: false; error: SubmissionError };

const DEVICE = /^[A-Za-z0-9-]{8,64}$/;
const VERSION = /^[A-Za-z0-9._+-]{1,32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

export function parseSubmission(body: unknown): Parsed {
  if (!isRecord(body)) return { ok: false, error: 'bad-request' };
  const { score, distance, duration, version, device } = body;
  if (![score, distance, duration].every(Number.isSafeInteger)) return { ok: false, error: 'bad-request' };
  if (!isText(version, VERSION) || !isText(device, DEVICE)) return { ok: false, error: 'bad-request' };
  const name = normalizeName(body.name);
  if (name === null || isOffensive(name)) return { ok: false, error: 'name' };
  const run = { score: score as number, distance: distance as number, duration: duration as number };
  if (!isPlausible(run)) return { ok: false, error: 'implausible' };
  return { ok: true, value: { name, ...run, version, device } };
}
