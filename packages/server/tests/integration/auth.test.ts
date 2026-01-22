import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { createSoftwareAuthenticator } from '../lib/software-authenticator.ts';

// Helper to find a cookie from set-cookie header
function findCookie(setCookie: string | string[] | undefined, prefix: string): string | undefined {
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.find((c) => c.startsWith(prefix));
}

describe('Authentication', () => {
  const app = createApp();
  const authenticator = createSoftwareAuthenticator();
  let testCredential: {
    credentialId: string;
    publicKey: string;
    privateKey: string;
  };

  beforeAll(async () => {
    // Create a test credential
    testCredential = await authenticator.createCredential('localhost');

    // Set the admin credential env var
    const credentialData = {
      credentialId: testCredential.credentialId,
      publicKey: testCredential.publicKey,
    };
    process.env.ADMIN_CREDENTIAL = Buffer.from(JSON.stringify(credentialData)).toString('base64');
  });

  describe('POST /api/auth/login/options', () => {
    it('should return authentication options', async () => {
      const response = await request(app).post('/api/auth/login/options').expect(200);

      expect(response.body).toHaveProperty('challenge');
      expect(response.body).toHaveProperty('rpId', 'localhost');
      expect(response.body).toHaveProperty('allowCredentials');
      expect(response.body.allowCredentials).toHaveLength(1);
      expect(response.body.allowCredentials[0].id).toBe(testCredential.credentialId);
    });
  });

  describe('POST /api/auth/login/verify', () => {
    it('should verify authentication and create session', async () => {
      // Get authentication options
      const optionsResponse = await request(app).post('/api/auth/login/options').expect(200);

      const { challenge } = optionsResponse.body;
      const challengeIdCookie = optionsResponse.headers['set-cookie']?.[0];

      // Load the credential into the authenticator
      await authenticator.loadCredential(testCredential.credentialId, testCredential.privateKey);

      // Sign the challenge
      const assertion = await authenticator.signChallenge(
        testCredential.credentialId,
        challenge,
        'localhost',
        'http://localhost:3000'
      );

      // Verify with server
      const verifyResponse = await request(app)
        .post('/api/auth/login/verify')
        .set('Cookie', challengeIdCookie)
        .send(assertion)
        .expect(200);

      expect(verifyResponse.body).toEqual({ success: true });
      expect(verifyResponse.headers['set-cookie']).toBeDefined();

      // Check we got a session cookie
      const sessionCookie = findCookie(verifyResponse.headers['set-cookie'], 'session=');
      expect(sessionCookie).toBeDefined();
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return unauthenticated when no session', async () => {
      const response = await request(app).get('/api/auth/status').expect(200);

      expect(response.body).toEqual({ authenticated: false });
    });

    it('should return authenticated with valid session', async () => {
      // Login first
      const optionsResponse = await request(app).post('/api/auth/login/options').expect(200);

      const { challenge } = optionsResponse.body;
      const challengeIdCookie = optionsResponse.headers['set-cookie']?.[0];

      await authenticator.loadCredential(testCredential.credentialId, testCredential.privateKey);

      const assertion = await authenticator.signChallenge(
        testCredential.credentialId,
        challenge,
        'localhost',
        'http://localhost:3000'
      );

      const verifyResponse = await request(app)
        .post('/api/auth/login/verify')
        .set('Cookie', challengeIdCookie)
        .send(assertion)
        .expect(200);

      const sessionCookie = findCookie(verifyResponse.headers['set-cookie'], 'session=');
      expect(sessionCookie).toBeDefined();

      // Check status with session
      const statusResponse = await request(app)
        .get('/api/auth/status')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(statusResponse.body).toEqual({ authenticated: true });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear session', async () => {
      // Login first
      const optionsResponse = await request(app).post('/api/auth/login/options').expect(200);

      const { challenge } = optionsResponse.body;
      const challengeIdCookie = optionsResponse.headers['set-cookie']?.[0];

      await authenticator.loadCredential(testCredential.credentialId, testCredential.privateKey);

      const assertion = await authenticator.signChallenge(
        testCredential.credentialId,
        challenge,
        'localhost',
        'http://localhost:3000'
      );

      const verifyResponse = await request(app)
        .post('/api/auth/login/verify')
        .set('Cookie', challengeIdCookie)
        .send(assertion)
        .expect(200);

      const sessionCookie = findCookie(verifyResponse.headers['set-cookie'], 'session=');
      expect(sessionCookie).toBeDefined();

      // Logout
      await request(app).post('/api/auth/logout').set('Cookie', sessionCookie!).expect(200);

      // Check status - should be unauthenticated
      const statusResponse = await request(app)
        .get('/api/auth/status')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(statusResponse.body).toEqual({ authenticated: false });
    });
  });
});
