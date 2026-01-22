import Database from 'better-sqlite3';
import { config } from '../config.ts';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.databasePath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Query helpers
export function query<T>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

export function exec(sql: string): void {
  getDb().exec(sql);
}
