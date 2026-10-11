import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { D1_MAX_COMPOUND_TERMS, FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration = read('../migrations/0007_feedback_triage.sql');
const schema = read('../schema.sql');

let db: FakeD1;

const columns = (target: FakeD1, table: string) =>
  (target.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[]).map((c) => c.name);

/** A database as it was after 0006: feedback without the triage columns, with one row. */
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
});

describe('migration 0007_feedback_triage', () => {
  it('adds status (default open), issue and reply, keeping old rows as open without issue or reply', () => {
    db.sqlite.exec(migration);
    expect(columns(db, 'feedback').slice(-3)).toEqual(['status', 'issue', 'reply']);
    expect(db.sqlite.prepare('SELECT text, status, issue, reply FROM feedback').all()).toEqual([
      { text: 'Hängt', status: 'open', issue: null, reply: null },
    ]);
  });

  it('accepts only the four statuses', () => {
    db.sqlite.exec(migration);
    for (const status of ['open', 'todo', 'done', 'rejected']) {
      expect(() => db.sqlite.prepare('UPDATE feedback SET status = ?').run(status)).not.toThrow();
    }
    expect(() => db.sqlite.prepare("UPDATE feedback SET status = 'later'").run()).toThrow(/CHECK/);
  });

  it('matches schema.sql, which is harmless after it', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    expect(columns(db, 'feedback')).toEqual(columns(new FakeD1(), 'feedback'));
  });

  it('fails on a second run at its first statement without changing data', () => {
    db.sqlite.exec(migration);
    db.sqlite.exec("UPDATE feedback SET status = 'todo', issue = 7");
    expect(() => db.sqlite.exec(migration)).toThrow(/duplicate column name: status/);
    expect(db.sqlite.prepare('SELECT status, issue FROM feedback').all()).toEqual([{ status: 'todo', issue: 7 }]);
  });

  it('stays within D1\'s compound SELECT limit', () => {
    const terms = (migration.match(/\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b/gi)?.length ?? 0) + 1;
    expect(terms).toBeLessThanOrEqual(D1_MAX_COMPOUND_TERMS);
  });
});
