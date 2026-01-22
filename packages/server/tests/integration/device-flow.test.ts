import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.ts';

describe('Device Authorization Flow', () => {
  const app = createApp();

  describe('POST /api/device/code', () => {
    it('should return device code and user code', async () => {
      const response = await request(app)
        .post('/api/device/code')
        .send({
          devpod_name: 'test-devpod',
          repos: ['org/repo-a', 'org/repo-b'],
        })
        .expect(200);

      expect(response.body).toHaveProperty('device_code');
      expect(response.body).toHaveProperty('user_code');
      expect(response.body).toHaveProperty('verification_uri');
      expect(response.body).toHaveProperty('expires_in');
      expect(response.body).toHaveProperty('interval');

      // User code should be in XXXX-XXXX format
      expect(response.body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('should reject request without devpod_name', async () => {
      const response = await request(app)
        .post('/api/device/code')
        .send({
          repos: ['org/repo-a'],
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request without repos', async () => {
      const response = await request(app)
        .post('/api/device/code')
        .send({
          devpod_name: 'test-devpod',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/device/poll', () => {
    it('should return authorization_pending for pending request', async () => {
      // First create a device code
      const codeResponse = await request(app)
        .post('/api/device/code')
        .send({
          devpod_name: 'test-devpod',
          repos: ['org/repo-a'],
        })
        .expect(200);

      // Poll for authorization
      const pollResponse = await request(app)
        .post('/api/device/poll')
        .send({
          device_code: codeResponse.body.device_code,
        })
        .expect(200);

      expect(pollResponse.body).toEqual({
        error: 'authorization_pending',
      });
    });

    it('should reject unknown device code', async () => {
      const response = await request(app)
        .post('/api/device/poll')
        .send({
          device_code: 'unknown-device-code',
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Device authorization approval (with dev auth)', () => {
    it('should complete the device flow when approved', async () => {
      // Create device code
      const codeResponse = await request(app)
        .post('/api/device/code')
        .send({
          devpod_name: 'test-devpod',
          repos: ['org/repo-a'],
        })
        .expect(200);

      const { device_code, user_code } = codeResponse.body;

      // Look up pending authorization (using dev auth)
      const pendingResponse = await request(app)
        .get(`/api/device/pending/${user_code}`)
        .set('X-Dev-Auth', '1')
        .expect(200);

      expect(pendingResponse.body).toHaveProperty('devpod_name', 'test-devpod');
      expect(pendingResponse.body).toHaveProperty('requested_repos');

      // Approve the authorization (using dev auth)
      const approveResponse = await request(app)
        .post('/api/device/authorize')
        .set('X-Dev-Auth', '1')
        .send({
          user_code,
          action: 'approve',
        })
        .expect(200);

      expect(approveResponse.body).toHaveProperty('success', true);
      expect(approveResponse.body).toHaveProperty('status', 'approved');

      // Poll should now return registration token
      const pollResponse = await request(app)
        .post('/api/device/poll')
        .send({
          device_code,
        })
        .expect(200);

      expect(pollResponse.body).toHaveProperty('registration_token');
      expect(pollResponse.body.registration_token).toBeTruthy();
    });

    it('should return access_denied when denied', async () => {
      // Create device code
      const codeResponse = await request(app)
        .post('/api/device/code')
        .send({
          devpod_name: 'test-devpod',
          repos: ['org/repo-a'],
        })
        .expect(200);

      const { device_code, user_code } = codeResponse.body;

      // Deny the authorization (using dev auth)
      await request(app)
        .post('/api/device/authorize')
        .set('X-Dev-Auth', '1')
        .send({
          user_code,
          action: 'deny',
        })
        .expect(200);

      // Poll should return access_denied
      const pollResponse = await request(app)
        .post('/api/device/poll')
        .send({
          device_code,
        })
        .expect(200);

      expect(pollResponse.body).toEqual({
        error: 'access_denied',
      });
    });
  });
});
