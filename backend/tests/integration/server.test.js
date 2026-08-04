const request = require('supertest');

const app = require('../../src/server');
const { ROLES } = require('../../src/constants/roles');

describe('Server wiring', () => {
  describe('Root and unmatched routes', () => {
    test('should describe the API at the root', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.body).toMatchObject({
        name: 'NyelvSzó API',
        documentation: '/api-docs',
        health: '/health',
      });
      expect(response.body.version).toEqual(expect.any(String));
    });

    test('should answer 404 for an unmatched path', async () => {
      const response = await request(app).get('/no-such-route').expect(404);

      expect(response.body.type).toBe('NotFoundError');
      expect(response.body.error).toBe('Cannot GET /no-such-route');
    });

    test('should answer 404 for an unmatched method on a known path', async () => {
      await request(app).delete('/login').expect(404);
    });

    test('should not serve the routes the refactor removed', async () => {
      // /versionhistory, /contact and /preface used to be aliases of the
      // entries router; nothing may resurrect them silently.
      for (const path of ['/versionhistory', '/contact', '/preface', '/ws', '/api/entries']) {
        const response = await request(app).get(path);
        expect(response.status).toBe(404);
      }
    });
  });

  describe('Security headers', () => {
    test('should not advertise the framework', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    test('should send a content security policy with the corrected directives', async () => {
      const response = await request(app).get('/').expect(200);

      const csp = response.headers['content-security-policy'];

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      // `base-uri`, not the `base-src` typo, which no browser implements.
      expect(csp).toContain("base-uri 'self'");
      expect(csp).not.toContain('base-src');
    });

    test('should send HSTS and a strict referrer policy', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('CORS', () => {
    test('should allow a configured origin', async () => {
      const response = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:4200')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4200');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should refuse an unlisted origin by omitting the header, not by erroring', async () => {
      // Passing an Error to the cors callback turned a disallowed origin into a
      // 500; omitting the header lets the browser refuse, which is correct.
      const response = await request(app).get('/').set('Origin', 'https://evil.example');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('should answer a preflight from an allowed origin with 204', async () => {
      await request(app)
        .options('/entries')
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
    });
  });

  describe('Body parsing', () => {
    test('should reject a body over the size limit', async () => {
      const response = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(200 * 1024) }));

      expect(response.status).toBe(413);
    });

    test('should reject a non-object JSON body in strict mode', async () => {
      const response = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json')
        .send('"just a string"');

      expect(response.status).toBe(400);
    });
  });

  describe('API documentation', () => {
    test('should serve the Swagger UI', async () => {
      const response = await request(app).get('/api-docs/').expect(200);

      expect(response.headers['content-type']).toContain('text/html');
    });
  });
});

describe('Health endpoints', () => {
  test('should report liveness without touching the database', async () => {
    const response = await request(app).get('/health/live').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  test('should report readiness', async () => {
    const response = await request(app).get('/health/ready').expect(200);

    expect(response.body).toEqual({ status: 'ok', database: 'connected' });
  });

  test('should keep the public summary terse', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      uptimeSeconds: expect.any(Number),
    });

    // Reconnaissance material the old endpoint handed to anonymous callers.
    expect(response.body).not.toHaveProperty('nodeVersion');
    expect(response.body).not.toHaveProperty('environment');
    expect(response.body).not.toHaveProperty('memory');
    expect(response.body).not.toHaveProperty('database');
  });

  describe('GET /health/detailed', () => {
    test('should require authentication', async () => {
      await request(app).get('/health/detailed').expect(401);
    });

    test('should refuse a viewer and an editor', async () => {
      const viewer = await createTestUser({ email: 'viewer@example.com', role: ROLES.VIEWER });
      const editor = await createTestUser({ email: 'editor@example.com', role: ROLES.EDITOR });

      await request(app)
        .get('/health/detailed')
        .set('Authorization', authHeader(viewer))
        .expect(403);

      await request(app)
        .get('/health/detailed')
        .set('Authorization', authHeader(editor))
        .expect(403);
    });

    test('should report operational detail to an admin', async () => {
      const admin = await createTestUser({ email: 'admin@example.com', role: ROLES.ADMIN });

      const response = await request(app)
        .get('/health/detailed')
        .set('Authorization', authHeader(admin))
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        environment: 'test',
        nodeVersion: process.version,
        database: { status: 'connected', connected: true },
      });
      expect(response.body.memory.rssMb).toEqual(expect.any(Number));
      expect(response.body.cache).toHaveProperty('hitRatio');
      expect(response.body.cache.tiers).toHaveProperty('short');
    });
  });
});
