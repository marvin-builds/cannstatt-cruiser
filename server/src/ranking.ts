/**
 * Highscore order and the public entry shape. Best score first; on a tie the
 * earlier entry (date, then insert order) ranks higher.
 */
export const TOP_SIZE = 20;
/** Rows kept in the table; worse ones are deleted after each insert. */
export const KEEP_ROWS = 500;

const ORDER = 'ORDER BY score DESC, date ASC, id ASC';

export const TOP_QUERY = `SELECT id, name, score, distance, date FROM scores ${ORDER} LIMIT ${TOP_SIZE}`;
export const PRUNE_QUERY = `DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ${ORDER} LIMIT ${KEEP_ROWS})`;

export interface ScoreRow {
  id: number;
  name: string;
  score: number;
  distance: number;
  date: string;
}

export interface Entry {
  rank: number;
  name: string;
  score: number;
  distance: number;
  date: string;
}

/** Entries for `rows` (already in TOP_QUERY order) and the rank of row `id` (null if absent). */
export function rankRows(rows: readonly ScoreRow[], id: number | null): { entries: Entry[]; rank: number | null } {
  const entries = rows.map(({ name, score, distance, date }, i) => ({ rank: i + 1, name, score, distance, date }));
  const index = id === null ? -1 : rows.findIndex((row) => row.id === id);
  return { entries, rank: index < 0 ? null : index + 1 };
}
