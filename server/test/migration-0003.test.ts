import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration = read('../migrations/0003_play_statistics.sql');
const schema = read('../schema.sql');

let db: FakeD1;

/** A database as it was before the migration: the schema without the statistics tables. */
beforeEach(() => {
  db = new FakeD1();
  db.sqlite.exec('DROP TABLE events; DROP TABLE event_days; DROP TABLE event_meta;');
});

const names = (type: string) =>
  db.sqlite.prepare('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name').all(type).map((row) => (row as { name: string }).name);

describe('migration 0003_play_statistics', () => {
  it('adds the statistics tables and indexes and keeps the scores', () => {
    db.sqlite.exec("INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES ('A', 1, 1, 1, 'v', 'd', 'x')");
    db.sqlite.exec(migration);
    expect(names('table')).toEqual(expect.arrayContaining(['events', 'event_days', 'event_meta', 'scores', 'submissions']));
    expect(names('index')).toEqual(expect.arrayContaining(['events_day_kind', 'events_session', 'events_once_per_session']));
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get()).toEqual({ n: 1 });
  });

  it('allows one session and one end row per session but many runs', () => {
    db.sqlite.exec(migration);
    const insert = db.sqlite.prepare("INSERT INTO events (session, kind, day, hour) VALUES ('s', ?, '2026-10-11', 1)");
    insert.run('run');
    insert.run('run');
    insert.run('session');
    insert.run('end');
    expect(() => insert.run('session')).toThrow(/UNIQUE/);
    expect(() => insert.run('end')).toThrow(/UNIQUE/);
  });

  it('can be applied twice, and schema.sql after it', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(migration)).not.toThrow();
    expect(() => db.sqlite.exec(schema)).not.toThrow();
  });
});
