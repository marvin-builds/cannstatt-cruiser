import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { ISSUE_STATES } from '../src/feedback-triage-rules';
import { D1_MAX_COMPOUND_TERMS, FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration0007 = read('../migrations/0007_feedback_triage.sql');
const migration0008 = read('../migrations/0008_feedback_keys.sql');
const migration = read('../migrations/0009_issue_state.sql');
const schema = read('../schema.sql');

let db: FakeD1;

const columns = (target: FakeD1, table: string) =>
  (target.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[]).map((c) => c.name);

/** A database as it was after 0008, with one row that has an issue. */
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
  db.sqlite.exec(migration0008);
  db.sqlite.exec("UPDATE feedback SET status = 'todo', issue = 7, key_hash = 'h'");
});

describe('migration 0009_issue_state', () => {
  it('adds issue_state and issue_closed_day, keeping old rows with both NULL (read on the next board load)', () => {
    db.sqlite.exec(migration);
    expect(columns(db, 'feedback').slice(-2)).toEqual(['issue_state', 'issue_closed_day']);
    expect(db.sqlite.prepare('SELECT status, issue, key_hash, issue_state, issue_closed_day FROM feedback').all()).toEqual([
      { status: 'todo', issue: 7, key_hash: 'h', issue_state: null, issue_closed_day: null },
    ]);
  });

  it('accepts only the issue states (or NULL)', () => {
    db.sqlite.exec(migration);
    for (const state of ISSUE_STATES) {
      expect(() => db.sqlite.prepare('UPDATE feedback SET issue_state = ?').run(state), state).not.toThrow();
    }
    expect(() => db.sqlite.exec('UPDATE feedback SET issue_state = NULL')).not.toThrow();
    expect(() => db.sqlite.exec("UPDATE feedback SET issue_state = 'closed'")).toThrow(/CHECK constraint/);
  });

  it('matches schema.sql, which is harmless after it and has the same CHECK', () => {
    db.sqlite.exec(migration);
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    const fresh = new FakeD1();
    expect(columns(db, 'feedback')).toEqual(columns(fresh, 'feedback'));
    fresh.sqlite.exec(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
      VALUES ('2026-10-10', 'bug', 'x', '2026-10-11.4', 'ios', 'touch', 'portrait', 390, '[]')`);
    expect(() => fresh.sqlite.exec("UPDATE feedback SET issue_state = 'closed'")).toThrow(/CHECK constraint/);
    expect(() => fresh.sqlite.exec("UPDATE feedback SET issue_state = 'notPlanned'")).not.toThrow();
  });

  it('fails on a second run at its first statement without changing data', () => {
    db.sqlite.exec(migration);
    db.sqlite.exec("UPDATE feedback SET issue_state = 'completed', issue_closed_day = '2026-10-12'");
    expect(() => db.sqlite.exec(migration)).toThrow(/duplicate column name: issue_state/);
    expect(db.sqlite.prepare('SELECT issue_state, issue_closed_day FROM feedback').all()).toEqual([{ issue_state: 'completed', issue_closed_day: '2026-10-12' }]);
  });

  it('stays within D1\'s compound SELECT limit', () => {
    const terms = (migration.match(/\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b/gi)?.length ?? 0) + 1;
    expect(terms).toBeLessThanOrEqual(D1_MAX_COMPOUND_TERMS);
  });
});
