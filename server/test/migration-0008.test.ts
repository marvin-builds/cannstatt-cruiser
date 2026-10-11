import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { D1_MAX_COMPOUND_TERMS, FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration0007 = read('../migrations/0007_feedback_triage.sql');
const migration = read('../migrations/0008_feedback_keys.sql');
const schema = read('../schema.sql');

let db: FakeD1;

const columns = (target: FakeD1, table: string) =>
  (target.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[]).map((c) => c.name);

/** A database as it was after 0007: feedback with the triage columns, without key_hash and done_version, with one triaged row. */
beforeEach(() => {
  db = new FakeD1();
  db.sqlite.exec(`
    DROP TABLE feedback;
    CREATE TABLE feedback (
      id INTEGER PRIMARY KEY, day TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, version TEXT NOT NULL,
      platform TEXT NOT NULL, input TEXT NOT NULL, orientation TEXT NOT NULL, view_width INTEGER NOT NULL, log TEXT NOT NULL
    );
    CREATE INDEX feedback_day ON feedback (day, id);
    INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
      VALUES ('2026-10-10', 'bug', 'Hängt', '2026-10-11.4', 'ios', 'touch', 'portrait', 390, '[]');
  `);
  db.sqlite.exec(migration0007);
  db.sqlite.exec("UPDATE feedback SET status = 'done', reply = 'Behoben'");
});

describe('migration 0008_feedback_keys', () => {
  it('adds key_hash and done_version, keeping old rows with both NULL', () => {
    db.sqlite.exec(migration);
    expect(columns(db, 'feedback').slice(-2)).toEqual(['key_hash', 'done_version']);
    expect(db.sqlite.prepare('SELECT text, status, reply, key_hash, done_version FROM feedback').all()).toEqual([
      { text: 'Hängt', status: 'done', reply: 'Behoben', key_hash: null, done_version: null },
    ]);
  });

  it('matches schema.sql, which is harmless after it', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    expect(columns(db, 'feedback')).toEqual(columns(new FakeD1(), 'feedback'));
  });

  it('fails on a second run at its first statement without changing data', () => {
    db.sqlite.exec(migration);
    db.sqlite.exec("UPDATE feedback SET key_hash = 'h', done_version = '2026-10-12.1'");
    expect(() => db.sqlite.exec(migration)).toThrow(/duplicate column name: key_hash/);
    expect(db.sqlite.prepare('SELECT key_hash, done_version FROM feedback').all()).toEqual([{ key_hash: 'h', done_version: '2026-10-12.1' }]);
  });

  it('stays within D1\'s compound SELECT limit', () => {
    const terms = (migration.match(/\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b/gi)?.length ?? 0) + 1;
    expect(terms).toBeLessThanOrEqual(D1_MAX_COMPOUND_TERMS);
  });
});
