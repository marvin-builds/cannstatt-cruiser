/**
 * Rules of the online list on the client: when "Eintragen" is offered, the
 * name rules (the same as server/src/name.ts, so a bad name is caught before
 * sending), the remembered name and the last submitted entry (to highlight it).
 */
import type { Store } from '../core/storage';

/** The list's length (GET /top). */
export const TOP_SIZE = 20;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

const ALLOWED = /^[A-Za-z0-9äöüßÄÖÜ _.-]+$/;
const NOT_ALLOWED = /[^A-Za-z0-9äöüßÄÖÜ _.-]/g;

/** Store keys: the remembered name (separate in kid mode, so no free text shows there) and the last entry sent. */
const NAME_KEY = 'scoreName';
const KID_NAME_KEY = 'scoreKidName';
const LAST_ENTRY_KEY = 'scoreLastEntry';

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

export function loadName(store: Store, kid: boolean): string {
  const name = store.get<unknown>(kid ? KID_NAME_KEY : NAME_KEY, '');
  return typeof name === 'string' && nameProblem(name) === null ? name : '';
}

export function saveName(store: Store, kid: boolean, name: string): void {
  store.set(kid ? KID_NAME_KEY : NAME_KEY, name);
}

export interface LastEntry {
  name: string;
  score: number;
}

export function loadLastEntry(store: Store): LastEntry | null {
  const e = store.get<unknown>(LAST_ENTRY_KEY, null);
  if (typeof e !== 'object' || e === null) return null;
  const { name, score } = e as Record<string, unknown>;
  return typeof name === 'string' && typeof score === 'number' ? { name, score } : null;
}

export function saveLastEntry(store: Store, entry: LastEntry): void {
  store.set(LAST_ENTRY_KEY, entry);
}

/** Rank of the own entry (same name and score as the last one sent) in the list, or null. */
export function ownRank(entries: readonly { rank: number; name: string; score: number }[], last: LastEntry | null): number | null {
  if (!last) return null;
  return entries.find((e) => e.name === last.name && e.score === last.score)?.rank ?? null;
}
