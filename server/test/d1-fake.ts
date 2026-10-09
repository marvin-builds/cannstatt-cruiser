/**
 * In-memory stand-in for a D1 database: Node's built-in SQLite with
 * schema.sql applied, behind the slice of the D1 API the worker uses
 * (prepare/bind/all/first/run and batch). No network, no wrangler.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const schema = readFileSync(fileURLToPath(new URL('../schema.sql', import.meta.url).href), 'utf8');

class FakeStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...params: SQLInputValue[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, params);
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: object }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async run(): Promise<{ results: []; success: true; meta: { last_row_id: number; changes: number } }> {
    const { lastInsertRowid, changes } = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { last_row_id: Number(lastInsertRowid), changes: Number(changes) } };
  }
}

export class FakeD1 {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec(schema);
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.sqlite, sql);
  }

  /** Like D1, runs the statements in one transaction and returns their results in order. */
  async batch(statements: FakeStatement[]): Promise<unknown[]> {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  /** The fake as the worker's binding type. */
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
