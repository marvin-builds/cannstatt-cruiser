import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { D1_MAX_COMPOUND_TERMS, FakeD1 } from './d1-fake';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url).href), 'utf8');
const migration = read('../migrations/0005_feedback.sql');
const schema = read('../schema.sql');

let db: FakeD1;

/** A database as it was before the migration: the schema without the feedback tables. */
beforeEach(() => {
  db = new FakeD1();
  db.sqlite.exec('DROP TABLE feedback; DROP TABLE feedback_counts;');
  db.sqlite.exec("INSERT INTO scores (name, score, distance, duration, version, date, device) VALUES ('A', 1, 1, 1, 'v', 'd', 'x')");
  db.sqlite.exec("INSERT INTO events (session, kind, day, hour) VALUES ('s', 'session', '2026-10-10', 9)");
});

const count = (table: string) => (db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const columns = (table: string) =>
  (db.sqlite.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all() as { name: string }[]).map((c) => c.name);

const insertFeedback = () =>
  db.sqlite.exec(`INSERT INTO feedback (day, kind, text, version, platform, input, orientation, view_width, log)
    VALUES ('2026-10-10', 'idea', 'Mehr Level', '2026-10-10.1', 'ios', 'touch', 'portrait', 390, '[]')`);

describe('migration 0005_feedback', () => {
  it('adds the feedback and counter tables without session or IP columns and keeps existing data', () => {
    db.sqlite.exec(migration);
    expect(columns('feedback')).toEqual(['id', 'day', 'kind', 'text', 'version', 'platform', 'input', 'orientation', 'view_width', 'log']);
    expect(columns('feedback_counts')).toEqual(['day', 'session_hash', 'count']);
    expect(count('scores')).toBe(1);
    expect(count('events')).toBe(1);
    const indexes = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'feedback'").all();
    expect(indexes).toContainEqual({ name: 'feedback_day' });
  });

  it('keeps one counter per day and session hash', () => {
    db.sqlite.exec(migration);
    const insert = db.sqlite.prepare("INSERT INTO feedback_counts (day, session_hash, count) VALUES ('2026-10-10', 'h', ?)");
    insert.run(1);
    expect(() => insert.run(2)).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it('can be applied twice without losing feedback, and schema.sql after it', () => {
    db.sqlite.exec(migration);
    insertFeedback();
    expect(() => db.sqlite.exec(migration)).not.toThrow();
    expect(() => db.sqlite.exec(schema)).not.toThrow();
    expect(count('feedback')).toBe(1);
  });

  it('stays within D1\'s compound SELECT limit', () => {
    const terms = (migration.match(/\b(UNION(\s+ALL)?|INTERSECT|EXCEPT)\b/gi)?.length ?? 0) + 1;
    expect(terms).toBeLessThanOrEqual(D1_MAX_COMPOUND_TERMS);
  });
});
