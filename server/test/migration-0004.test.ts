import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration = read('../migrations/0004_day_summaries.sql');
const schema = read('../schema.sql');

let db: FakeD1;

/** A database as it was before the migration: the schema without the summary table. */
beforeEach(() => {
  db = new FakeD1();
  db.sqlite.exec('DROP TABLE day_summaries;');
  db.sqlite.exec("INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES ('A', 1, 1, 1, 'v', 'd', 'x')");
  db.sqlite.exec("INSERT INTO events (session, kind, day, hour) VALUES ('s', 'session', '2026-10-10', 9)");
});

const count = (table: string) => (db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('migration 0004_day_summaries', () => {
  it('adds the day_summaries table and keeps the scores and events', () => {
    db.sqlite.exec(migration);
    const columns = db.sqlite.prepare("SELECT name FROM pragma_table_info('day_summaries') ORDER BY cid").all();
    expect(columns).toEqual([{ name: 'day' }, { name: 'metric' }, { name: 'key' }, { name: 'value' }]);
    expect(count('scores')).toBe(1);
    expect(count('events')).toBe(1);
  });

  it('keeps one value per day, metric and key', () => {
    db.sqlite.exec(migration);
    const insert = db.sqlite.prepare("INSERT INTO day_summaries (day, metric, key, value) VALUES ('2026-10-10', 'total', 'sessions', ?)");
    insert.run(1);
    expect(() => insert.run(2)).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it('can be applied twice without losing summaries, and schema.sql after it', () => {
    db.sqlite.exec(migration);
    db.sqlite.exec("INSERT INTO day_summaries (day, metric, key, value) VALUES ('2026-10-10', 'total', 'sessions', 1)");
    expect(() => db.sqlite.exec(migration)).not.toThrow();
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    expect(count('day_summaries')).toBe(1);
  });
});
