import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { config } from '../config.ts';
import { generateId, generateToken, generateUserCode, hashToken } from '../lib/crypto.ts';
import { queryOne, run } from '../lib/db.ts';
import { isValidSession } from '../services/sessions.ts';

export const deviceRouter = Router();

interface PendingAuth {
  id: number;
  device_code: string;
  user_code: string;
  devpod_name: string;
  requested_repos: string;
  expires_at: string;
  status: string;
  created_at: string;
}

// Middleware for admin-only routes
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const isDevAuth = (req as Request & { isDevAuth?: boolean }).isDevAuth;
  if (config.isDev() && isDevAuth) {
    next();
    return;
  }

  const sessionId = req.cookies?.session;
  if (!sessionId || !isValidSession(sessionId)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// POST /api/device/code - Start device authorization (called by devpod CLI)
deviceRouter.post('/code', (req, res) => {
  const { devpod_name, repos } = req.body;

  if (!devpod_name || !Array.isArray(repos) || repos.length === 0) {
    res.status(400).json({ error: 'devpod_name and repos array required' });
    return;
  }

  const deviceCode = generateId(32);
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  run(
    `INSERT INTO pending_authorizations
     (device_code, user_code, devpod_name, requested_repos, expires_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [deviceCode, userCode, devpod_name, JSON.stringify(repos), expiresAt, new Date().toISOString()]
  );

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${config.origin}/device`,
    expires_in: 900, // 15 minutes
    interval: 5, // Poll every 5 seconds
  });
});

// POST /api/device/poll - Poll for authorization completion (called by devpod CLI)
deviceRouter.post('/poll', (req, res) => {
  const { device_code } = req.body;

  if (!device_code) {
    res.status(400).json({ error: 'device_code required' });
    return;
  }

  const pending = queryOne<PendingAuth>(
    'SELECT * FROM pending_authorizations WHERE device_code = ?',
    [device_code]
  );

  if (!pending) {
    res.status(404).json({ error: 'invalid_grant' });
    return;
  }

  if (new Date(pending.expires_at) < new Date()) {
    run('DELETE FROM pending_authorizations WHERE device_code = ?', [device_code]);
    res.json({ error: 'expired_token' });
    return;
  }

  if (pending.status === 'pending') {
    res.json({ error: 'authorization_pending' });
    return;
  }

  if (pending.status === 'denied') {
    run('DELETE FROM pending_authorizations WHERE device_code = ?', [device_code]);
    res.json({ error: 'access_denied' });
    return;
  }

  if (pending.status === 'approved') {
    // Create registration and return token
    const registrationToken = generateToken();
    const tokenHash = hashToken(registrationToken);
    const registrationId = generateId(16);
    const now = new Date().toISOString();

    run(
      `INSERT INTO registrations
       (id, devpod_name, registration_token_hash, allowed_repos, created_at, token_request_count)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [registrationId, pending.devpod_name, tokenHash, pending.requested_repos, now]
    );

    // Clean up pending authorization
    run('DELETE FROM pending_authorizations WHERE device_code = ?', [device_code]);

    res.json({ registration_token: registrationToken });
    return;
  }

  res.status(500).json({ error: 'Unknown status' });
});

// GET /api/device/pending/:code - Look up pending auth by user code (admin only)
deviceRouter.get('/pending/:code', requireAuth, (req, res) => {
  const userCode = String(req.params.code).toUpperCase();

  const pending = queryOne<PendingAuth>(
    'SELECT * FROM pending_authorizations WHERE user_code = ? AND status = ?',
    [userCode, 'pending']
  );

  if (!pending) {
    res.status(404).json({ error: 'Not found or already processed' });
    return;
  }

  if (new Date(pending.expires_at) < new Date()) {
    res.status(404).json({ error: 'Authorization request expired' });
    return;
  }

  res.json({
    devpod_name: pending.devpod_name,
    requested_repos: JSON.parse(pending.requested_repos),
    created_at: pending.created_at,
    expires_at: pending.expires_at,
  });
});

// POST /api/device/authorize - Approve or deny (admin only)
deviceRouter.post('/authorize', requireAuth, (req, res) => {
  const { user_code, action } = req.body;

  if (!user_code || !['approve', 'deny'].includes(action)) {
    res.status(400).json({ error: 'user_code and action (approve/deny) required' });
    return;
  }

  const pending = queryOne<PendingAuth>(
    'SELECT * FROM pending_authorizations WHERE user_code = ? AND status = ?',
    [user_code.toUpperCase(), 'pending']
  );

  if (!pending) {
    res.status(404).json({ error: 'Not found or already processed' });
    return;
  }

  const newStatus = action === 'approve' ? 'approved' : 'denied';
  run('UPDATE pending_authorizations SET status = ? WHERE user_code = ?', [
    newStatus,
    user_code.toUpperCase(),
  ]);

  res.json({ success: true, status: newStatus });
});
