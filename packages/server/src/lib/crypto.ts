import { createHash, randomBytes } from 'node:crypto';

export function generateId(length = 32): string {
  return randomBytes(length).toString('base64url');
}

export function generateUserCode(): string {
  // Format: XXXX-XXXX (uppercase alphanumeric, no confusing chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  const part2 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `${part1}-${part2}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}
