import { generateId } from '../lib/crypto.ts';
import { queryOne, run } from '../lib/db.ts';

interface Session {
  id: number;
  session_id: string;
  created_at: string;
  expires_at: string;
}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createSession(): string {
  const sessionId = generateId(32);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  run('INSERT INTO admin_sessions (session_id, created_at, expires_at) VALUES (?, ?, ?)', [
    sessionId,
    now,
    expiresAt,
  ]);

  return sessionId;
}

export function isValidSession(sessionId: string): boolean {
  const session = queryOne<Session>(
    'SELECT * FROM admin_sessions WHERE session_id = ? AND expires_at > ?',
    [sessionId, new Date().toISOString()]
  );
  return !!session;
}

export function deleteSession(sessionId: string): void {
  run('DELETE FROM admin_sessions WHERE session_id = ?', [sessionId]);
}

export function cleanupExpiredSessions(): void {
  run('DELETE FROM admin_sessions WHERE expires_at < ?', [new Date().toISOString()]);
}
