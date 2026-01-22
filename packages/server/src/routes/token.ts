import { Router } from 'express';
import { queryOne, run } from '../lib/db.ts';
import { hashToken } from '../lib/crypto.ts';
import { createInstallationToken } from '../services/github.ts';

export const tokenRouter = Router();

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

// POST /api/token - Exchange registration token for GitHub installation token
tokenRouter.post('/', async (req, res) => {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Bearer token required' });
    return;
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  // Find registration by token hash
  const registration = queryOne<Registration>(
    'SELECT * FROM registrations WHERE registration_token_hash = ?',
    [tokenHash]
  );

  if (!registration) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (registration.revoked_at) {
    res.status(401).json({ error: 'Registration revoked' });
    return;
  }

  try {
    const repos = JSON.parse(registration.allowed_repos) as string[];

    // Request installation token from GitHub
    const installationToken = await createInstallationToken(repos);

    // Update usage stats
    run(
      'UPDATE registrations SET last_token_request = ?, token_request_count = token_request_count + 1 WHERE id = ?',
      [new Date().toISOString(), registration.id]
    );

    res.json({
      token: installationToken.token,
      expires_at: installationToken.expiresAt,
      repositories: repos,
    });
  } catch (error) {
    console.error('Failed to create installation token:', error);
    res.status(500).json({ error: 'Failed to create GitHub token' });
  }
});
