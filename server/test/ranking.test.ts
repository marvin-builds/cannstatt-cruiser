import { describe, expect, it } from 'vitest';
import { rankRows, TOP_QUERY } from '../src/ranking';

const row = (id: number, score: number, date: string) => ({ id, name: `P${id}`, score, distance: 100, date });

describe('rankRows', () => {
  it('numbers the rows from 1 and drops the internal id', () => {
    const { entries } = rankRows([row(7, 900, '2026-10-01'), row(3, 500, '2026-10-02')], null);
    expect(entries).toEqual([
      { rank: 1, name: 'P7', score: 900, distance: 100, date: '2026-10-01' },
      { rank: 2, name: 'P3', score: 500, distance: 100, date: '2026-10-02' },
    ]);
  });

  it('finds the rank of a given row id, or null when it is not listed', () => {
    const rows = [row(7, 900, 'a'), row(3, 500, 'b')];
    expect(rankRows(rows, 3).rank).toBe(2);
    expect(rankRows(rows, 99).rank).toBeNull();
    expect(rankRows(rows, null).rank).toBeNull();
  });
});

describe('TOP_QUERY', () => {
  it('orders by score desc, then earlier date, and takes 20', () => {
    expect(TOP_QUERY).toMatch(/ORDER BY score DESC, date ASC, id ASC LIMIT 20$/);
  });
});
