import express from 'express';
import request from 'supertest';
import { createCorsMiddleware } from '../middleware/cors.middleware';

describe('API CORS policy', () => {
  const app = express();
  app.use(createCorsMiddleware('https://app.example.com'));
  app.options('/api/v1/uploads/initiate', (_req, res) => res.sendStatus(204));
  app.post('/api/v1/uploads/initiate', (_req, res) => res.json({ success: true }));
  app.get('/auth/me', (_req, res) => res.json({ success: true }));

  it('allows cross-origin API-key preflight without enabling credentialed CORS', async () => {
    const response = await request(app)
      .options('/api/v1/uploads/initiate')
      .set('Origin', 'http://127.0.0.1:5500')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('allows API-key requests from any origin without cookies', async () => {
    const response = await request(app)
      .post('/api/v1/uploads/initiate')
      .set('Origin', 'http://127.0.0.1:5500')
      .set('Authorization', 'Bearer sk_live_example')
      .send({ filename: 'test.txt' });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('keeps cookie-authenticated endpoints restricted to configured origins', async () => {
    const allowed = await request(app)
      .get('/auth/me')
      .set('Origin', 'https://app.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const disallowed = await request(app)
      .get('/auth/me')
      .set('Origin', 'http://127.0.0.1:5500');
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
  });
});
