import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.ts';
import { run } from '../../src/lib/db.ts';
import { generateId, hashToken } from '../../src/lib/crypto.ts';

describe('Registrations', () => {
  const app = createApp();

  function createTestRegistration(name: string, repos: string[]) {
    const id = generateId(16);
    const token = generateId(32);
    const tokenHash = hashToken(token);

    run(
      `INSERT INTO registrations (id, devpod_name, registration_token_hash, allowed_repos, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [id, name, tokenHash, JSON.stringify(repos)]
    );

    return { id, token, tokenHash };
  }

  describe('GET /api/registrations (with dev auth)', () => {
    it('should list all registrations', async () => {
      // Create test registrations
      createTestRegistration('devpod-1', ['org/repo-a']);
      createTestRegistration('devpod-2', ['org/repo-b', 'org/repo-c']);

      const response = await request(app)
        .get('/api/registrations')
        .set('X-Dev-Auth', '1')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('devpod_name');
      expect(response.body[0]).toHaveProperty('allowed_repos');
      expect(response.body[0]).toHaveProperty('created_at');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/registrations')
        .expect(401);
    });
  });

  describe('GET /api/registrations/:id (with dev auth)', () => {
    it('should return a single registration', async () => {
      const { id } = createTestRegistration('test-devpod', ['org/repo-a']);

      const response = await request(app)
        .get(`/api/registrations/${id}`)
        .set('X-Dev-Auth', '1')
        .expect(200);

      expect(response.body).toHaveProperty('id', id);
      expect(response.body).toHaveProperty('devpod_name', 'test-devpod');
    });

    it('should return 404 for unknown id', async () => {
      await request(app)
        .get('/api/registrations/unknown-id')
        .set('X-Dev-Auth', '1')
        .expect(404);
    });
  });

  describe('DELETE /api/registrations/:id (with dev auth)', () => {
    it('should revoke a registration', async () => {
      const { id } = createTestRegistration('test-devpod', ['org/repo-a']);

      await request(app)
        .delete(`/api/registrations/${id}`)
        .set('X-Dev-Auth', '1')
        .expect(200);

      // Check it's revoked
      const response = await request(app)
        .get(`/api/registrations/${id}`)
        .set('X-Dev-Auth', '1')
        .expect(200);

      expect(response.body).toHaveProperty('revoked_at');
      expect(response.body.revoked_at).toBeTruthy();
    });
  });
});
