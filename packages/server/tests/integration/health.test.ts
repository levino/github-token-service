import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.ts';

describe('Health endpoint', () => {
  const app = createApp();

  it('should return ok status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
