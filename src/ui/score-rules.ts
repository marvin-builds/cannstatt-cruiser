/**
 * Rules of the online list on the client: when "Eintragen" is offered, the
 * name rules (the same as server/src/name.ts, so a bad name is caught before
 * sending) and the remembered name.
 */
import type { Store } from '../core/storage';

/** The list's length (GET /top). */
export const TOP_SIZE = 20;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

const ALLOWED = /^[A-Za-z0-9äöüßÄÖÜ _.-]+$/;
const NOT_ALLOWED = /[^A-Za-z0-9äöüßÄÖÜ _.-]/g;

/** Store key: the remembered name. */
const NAME_KEY = 'scoreName';

/**
 * Whether `score` would make the top list: above the last place of a full
 * list (a tie keeps the earlier entry), any score > 0 while it has fewer
 * than TOP_SIZE entries or none is known (offline: the run is queued).
 */
export function qualifies(score: number, top: readonly { score: number }[] | null): boolean {
  if (score <= 0) return false;
  if (!top || top.length < TOP_SIZE) return true;
  return score > top[TOP_SIZE - 1]!.score;
}

/** Trimmed, runs of spaces collapsed (as the server stores it). */
export function cleanName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
}

export type NameProblem = 'short' | 'long' | 'chars';

export function nameProblem(raw: string): NameProblem | null {
  const name = cleanName(raw);
  if (name.length < NAME_MIN) return 'short';
  if (name.length > NAME_MAX) return 'long';
  return ALLOWED.test(name) ? null : 'chars';
}

/** What typing may leave in the field: allowed characters only, at most NAME_MAX. */
export function stripNameInput(raw: string): string {
  return raw.normalize('NFC').replace(NOT_ALLOWED, '').slice(0, NAME_MAX);
}

export function loadName(store: Store): string {
  const name = store.get<unknown>(NAME_KEY, '');
  return typeof name === 'string' && nameProblem(name) === null ? name : '';
}

export function saveName(store: Store, name: string): void {
  store.set(NAME_KEY, name);
}
