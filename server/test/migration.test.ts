import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration = read('../migrations/0002_one_row_per_device.sql');
const schema = read('../schema.sql');

let db: FakeD1;

/** A database as it was before the migration: the schema without the unique device index. */
beforeEach(() => {
  db = new FakeD1();
  db.sqlite.exec('DROP INDEX scores_device');
});

function insert(rows: [device: string, name: string, score: number, date: string][]): void {
  const statement = db.sqlite.prepare("INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES (?, ?, 100, 60, 'v', ?, ?)");
  for (const [device, name, score, date] of rows) statement.run(name, score, date, device);
}

const remaining = () => db.sqlite.prepare('SELECT name FROM scores ORDER BY id').all().map((row) => (row as { name: string }).name);

describe('migration 0002_one_row_per_device', () => {
  it('keeps the best row per device: highest score, then earliest date, then lowest id', () => {
    insert([
      ['a', 'a-low', 100, '2026-10-01T00:00:00.000Z'],
      ['a', 'a-best', 300, '2026-10-03T00:00:00.000Z'],
      ['a', 'a-mid', 200, '2026-10-02T00:00:00.000Z'],
      ['b', 'b-late', 500, '2026-10-05T00:00:00.000Z'],
      ['b', 'b-early', 500, '2026-10-04T00:00:00.000Z'],
      ['c', 'c-first', 700, '2026-10-06T00:00:00.000Z'],
      ['c', 'c-second', 700, '2026-10-06T00:00:00.000Z'],
      ['d', 'd-only', 50, '2026-10-07T00:00:00.000Z'],
    ]);
    db.sqlite.exec(migration);
    expect(remaining()).toEqual(['a-best', 'b-early', 'c-first', 'd-only']);
  });

  it('adds a unique index on device', () => {
    insert([['a', 'a1', 100, '2026-10-01T00:00:00.000Z'], ['a', 'a2', 200, '2026-10-01T00:00:00.000Z']]);
    db.sqlite.exec(migration);
    expect(() => insert([['a', 'a3', 300, '2026-10-02T00:00:00.000Z']])).toThrow(/UNIQUE/);
  });

  it('leaves the database matching schema.sql, which can be applied again', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    const indexes = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'scores' AND name = 'scores_device'").all();
    expect(indexes).toHaveLength(1);
  });
});
