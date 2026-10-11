import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { D1_MAX_COMPOUND_TERMS, FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration = read('../migrations/0006_test_devices_and_returning.sql');
const schema = read('../schema.sql');

let db: FakeD1;

const columns = (table: string) =>
  (db.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[]).map((c) => c.name);

/** A database as it was before the migration: events and day_summaries without the new columns, with data. */
beforeEach(() => {
  db = new FakeD1();
  db.sqlite.exec(`
    DROP TABLE events;
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, hour INTEGER NOT NULL,
      version TEXT, input TEXT, orientation TEXT, platform TEXT, kid INTEGER, country TEXT, region TEXT, city TEXT,
      seconds INTEGER, score_bucket INTEGER, distance_bucket INTEGER
    );
    CREATE INDEX events_day_kind ON events (day, kind);
    CREATE INDEX events_session ON events (session, kind);
    CREATE UNIQUE INDEX events_once_per_session ON events (session, kind) WHERE kind IN ('session', 'end');
    DROP TABLE day_summaries;
    CREATE TABLE day_summaries (day TEXT NOT NULL, metric TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY (day, metric, key));
    INSERT INTO events (session, kind, day, hour, kid) VALUES ('s', 'session', '2026-10-10', 9, 0);
    INSERT INTO day_summaries (day, metric, key, value) VALUES ('2026-10-09', 'total', 'sessions', 4);
  `);
});

describe('migration 0006_test_devices_and_returning', () => {
  it('adds the nullable session flags to events and the player-only count to day_summaries, keeping old rows unmarked', () => {
    db.sqlite.exec(migration);
    expect(columns('events').slice(-2)).toEqual(['tester', 'is_returning']);
    expect(columns('events')).not.toContain('returning');
    expect(columns('day_summaries')).toEqual(['day', 'metric', 'key', 'value', 'player_value']);
    expect(db.sqlite.prepare('SELECT session, tester, is_returning FROM events').all()).toEqual([{ session: 's', tester: null, is_returning: null }]);
    expect(db.sqlite.prepare('SELECT value, player_value FROM day_summaries').all()).toEqual([{ value: 4, player_value: null }]);
  });

  it('matches schema.sql, which is harmless after it', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    const fresh = new FakeD1();
    const freshColumns = (table: string) =>
      (fresh.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[]).map((c) => c.name);
    expect(columns('events')).toEqual(freshColumns('events'));
    expect(columns('day_summaries')).toEqual(freshColumns('day_summaries'));
  });

  it('fails on a second run without changing data (columns cannot be added twice)', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(migration)).toThrow(/duplicate column/);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 1 });
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM day_summaries').get()).toEqual({ n: 1 });
  });

  it('stays within D1\'s compound SELECT limit', () => {
    const terms = (migration.match(/\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b/gi)?.length ?? 0) + 1;
    expect(terms).toBeLessThanOrEqual(D1_MAX_COMPOUND_TERMS);
  });
});
