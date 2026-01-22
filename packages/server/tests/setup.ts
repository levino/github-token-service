import { beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb, closeDb } from '../src/lib/db.ts';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

// Environment variables are set in vitest.config.ts to ensure they're available
// before any modules are loaded
const dbPath = process.env.DATABASE_PATH || './data/test.db';

beforeAll(async () => {
  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Remove existing test database
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  // Run migrations
  const db = getDb();

  // Create tables directly (simpler for tests than running db-migrate)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      session_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_authorizations (
      device_code TEXT PRIMARY KEY,
      user_code TEXT UNIQUE NOT NULL,
      devpod_name TEXT NOT NULL,
      requested_repos TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      registration_token_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      devpod_name TEXT NOT NULL,
      registration_token_hash TEXT UNIQUE NOT NULL,
      allowed_repos TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      last_token_request TEXT,
      token_request_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_registrations_token_hash ON registrations(registration_token_hash)');
});

beforeEach(() => {
  // Clear all data between tests
  const db = getDb();
  db.exec('DELETE FROM registrations');
  db.exec('DELETE FROM pending_authorizations');
  db.exec('DELETE FROM admin_sessions');
});

afterAll(() => {
  closeDb();
});
