import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.ts';
import { query, queryOne, run } from '../lib/db.ts';
import { isValidSession } from '../services/sessions.ts';

export const registrationsRouter = Router();

interface Registration {
  id: string;
  devpod_name: string;
  registration_token_hash: string;
  allowed_repos: string;
  created_at: string;
  revoked_at: string | null;
  last_token_request: string | null;
  token_request_count: number;
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

// GET /api/registrations - List all registrations
registrationsRouter.get('/', requireAuth, (_req, res) => {
  const registrations = query<Registration>(
    'SELECT * FROM registrations ORDER BY created_at DESC'
  );

  res.json(
    registrations.map((r) => ({
      id: r.id,
      devpod_name: r.devpod_name,
      allowed_repos: JSON.parse(r.allowed_repos),
      created_at: r.created_at,
      revoked_at: r.revoked_at,
      last_token_request: r.last_token_request,
      token_request_count: r.token_request_count,
      status: r.revoked_at ? 'revoked' : 'active',
    }))
  );
});

// GET /api/registrations/:id - Get single registration
registrationsRouter.get('/:id', requireAuth, (req, res) => {
  const registration = queryOne<Registration>(
    'SELECT * FROM registrations WHERE id = ?',
    [req.params.id]
  );

  if (!registration) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.json({
    id: registration.id,
    devpod_name: registration.devpod_name,
    allowed_repos: JSON.parse(registration.allowed_repos),
    created_at: registration.created_at,
    revoked_at: registration.revoked_at,
    last_token_request: registration.last_token_request,
    token_request_count: registration.token_request_count,
    status: registration.revoked_at ? 'revoked' : 'active',
  });
});

// DELETE /api/registrations/:id - Revoke registration
registrationsRouter.delete('/:id', requireAuth, (req, res) => {
  const registration = queryOne<Registration>(
    'SELECT * FROM registrations WHERE id = ?',
    [req.params.id]
  );

  if (!registration) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (registration.revoked_at) {
    res.status(400).json({ error: 'Already revoked' });
    return;
  }

  run('UPDATE registrations SET revoked_at = ? WHERE id = ?', [
    new Date().toISOString(),
    req.params.id,
  ]);

  res.json({ success: true });
});
