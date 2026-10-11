import { describe, expect, it } from 'vitest';
import { FakeD1 } from './d1-fake';

const compound = (terms: number) => Array.from({ length: terms }, (_, i) => `SELECT ${i} AS n`).join(' UNION ALL ');

describe('FakeD1 compound SELECT limit', () => {
  it('runs a compound SELECT of 5 terms like D1', async () => {
    const { results } = await new FakeD1().asD1().prepare(compound(5)).all();
    expect(results).toHaveLength(5);
  });

  it('rejects more than 5 terms like D1, also mixed operators and inside a batch', async () => {
    const db = new FakeD1().asD1();
    await expect(db.prepare(compound(6)).all()).rejects.toThrow('too many terms in compound SELECT');
    await expect(db.prepare(`${compound(3)} UNION SELECT 7 INTERSECT SELECT 7 EXCEPT SELECT 8`).first()).rejects.toThrow('too many terms in compound SELECT');
    await expect(db.batch([db.prepare(`INSERT INTO event_meta (key, value) ${compound(6).replaceAll(' AS n', ", 'x'")}`)])).rejects.toThrow(
      'too many terms in compound SELECT',
    );
  });
});
