import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { Router } from 'express';
import { config } from '../config.ts';

// Type for WebAuthn authentication response
interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  authenticatorAttachment?: 'platform' | 'cross-platform';
  clientExtensionResults: Record<string, unknown>;
  type: 'public-key';
}

import { generateId } from '../lib/crypto.ts';
import * as sessions from '../services/sessions.ts';

export const authRouter = Router();

// Store challenges temporarily (in production, use Redis or similar)
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

// Get authentication options (start login)
authRouter.post('/login/options', async (_req, res) => {
  if (!config.adminCredential) {
    res.status(503).json({ error: 'No admin credential configured' });
    return;
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials: [
      {
        id: config.adminCredential.credentialId,
      },
    ],
    userVerification: 'preferred',
  });

  // Store challenge for verification
  const challengeId = generateId(16);
  challenges.set(challengeId, {
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  res.cookie('auth_challenge_id', challengeId, {
    httpOnly: true,
    secure: config.isProd(),
    sameSite: 'strict',
    maxAge: 5 * 60 * 1000,
  });

  res.json(options);
});

// Verify authentication response (complete login)
authRouter.post('/login/verify', async (req, res) => {
  const challengeId = req.cookies.auth_challenge_id;
  if (!challengeId) {
    res.status(400).json({ error: 'No challenge found' });
    return;
  }

  const stored = challenges.get(challengeId);
  if (!stored || stored.expiresAt < Date.now()) {
    challenges.delete(challengeId);
    res.status(400).json({ error: 'Challenge expired' });
    return;
  }

  if (!config.adminCredential) {
    res.status(503).json({ error: 'No admin credential configured' });
    return;
  }

  try {
    const response = req.body as AuthenticationResponseJSON;

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential: {
        id: config.adminCredential.credentialId,
        publicKey: Buffer.from(config.adminCredential.publicKey, 'base64'),
        counter: 0, // We don't track counter for simplicity
      },
    });

    challenges.delete(challengeId);
    res.clearCookie('auth_challenge_id');

    if (!verification.verified) {
      res.status(401).json({ error: 'Authentication failed' });
      return;
    }

    // Create session
    const sessionId = sessions.createSession();

    res.cookie('session', sessionId, {
      httpOnly: true,
      secure: config.isProd(),
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Logout
authRouter.post('/logout', (req, res) => {
  const sessionId = req.cookies.session;
  if (sessionId) {
    sessions.deleteSession(sessionId);
  }
  res.clearCookie('session');
  res.json({ success: true });
});

// Check session status
authRouter.get('/status', (req, res) => {
  const sessionId = req.cookies.session;
  const isAuthenticated = sessionId ? sessions.isValidSession(sessionId) : false;
  res.json({ authenticated: isAuthenticated });
});
