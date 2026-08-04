const express = require('express');
const request = require('supertest');

const {
  cacheMiddleware,
  invalidateCache,
  getCacheStats,
  generateCacheKey,
  presets,
} = require('../../../src/middleware/cache');

/**
 * Build a throwaway app whose handler counts how often it actually ran.
 *
 * The point of the cache is that the handler stops being called; a hit counter
 * is the only way to tell a cached response from a recomputed one.
 *
 * @param {function} middleware - Cache middleware under test.
 * @param {object} [options] - Options.
 * @param {number} [options.status] - Status the handler responds with.
 * @returns {{app: object, calls: function}} App plus a handler-call counter.
 */
const appWith = (middleware, { status = 200 } = {}) => {
  let calls = 0;
  const app = express();

  app.get('/entries', middleware, (req, res) => {
    calls += 1;
    res.status(status).json({ data: 'payload', calls });
  });

  app.post('/entries', middleware, (req, res) => {
    calls += 1;
    res.status(status).json({ data: 'payload', calls });
  });

  return { app, calls: () => calls };
};

describe('cache middleware', () => {
  describe('generateCacheKey', () => {
    test('should be independent of query parameter order', () => {
      const a = generateCacheKey({ method: 'GET', path: '/entries', query: { b: '2', a: '1' } });
      const b = generateCacheKey({ method: 'GET', path: '/entries', query: { a: '1', b: '2' } });

      expect(a).toBe(b);
      expect(a).toBe('GET:/entries?a=1&b=2');
    });

    test('should distinguish paths, methods and values', () => {
      const base = { method: 'GET', path: '/entries', query: {} };

      expect(generateCacheKey(base)).not.toBe(generateCacheKey({ ...base, path: '/users' }));
      expect(generateCacheKey(base)).not.toBe(generateCacheKey({ ...base, method: 'HEAD' }));
      expect(generateCacheKey(base)).not.toBe(
        generateCacheKey({ ...base, query: { search: 'alma' } })
      );
    });

    test('should not include anything user-specific', () => {
      const key = generateCacheKey({
        method: 'GET',
        path: '/entries',
        query: { search: 'alma' },
        headers: { authorization: 'Bearer secret-token' },
        user: { userId: 'abc' },
      });

      expect(key).toBe('GET:/entries?search=alma');
      expect(key).not.toContain('secret-token');
      expect(key).not.toContain('abc');
    });

    test('should include the router mount point, not just the path within it', () => {
      // Inside a router mounted at /entries, `req.path` is only the part after
      // the mount point — "/" for the collection. Keying on that alone produced
      // keys with no mention of "entries", so invalidateCache.entries() matched
      // nothing and writes never evicted the cached list.
      const collection = generateCacheKey({
        method: 'GET',
        baseUrl: '/entries',
        path: '/',
        query: { search: 'alma' },
      });

      expect(collection).toBe('GET:/entries/?search=alma');
      expect(collection).toContain('/entries');

      const users = generateCacheKey({
        method: 'GET',
        baseUrl: '/users',
        path: '/',
        query: { search: 'alma' },
      });

      expect(users).not.toBe(collection);
    });
  });

  describe('outside production', () => {
    test('should be a no-op so tests and local runs see fresh data', async () => {
      const { app, calls } = appWith(cacheMiddleware('short'));

      await request(app).get('/entries').expect(200);
      const second = await request(app).get('/entries').expect(200);

      expect(calls()).toBe(2);
      expect(second.headers['x-cache']).toBeUndefined();
    });
  });

  describe('in production', () => {
    let previousEnv;

    beforeEach(() => {
      previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      invalidateCache.all();
    });

    afterEach(() => {
      process.env.NODE_ENV = previousEnv;
      invalidateCache.all();
    });

    test('should serve the second identical request from the cache', async () => {
      const { app, calls } = appWith(cacheMiddleware('short'));

      const first = await request(app).get('/entries').expect(200);
      expect(first.headers['x-cache']).toBe('MISS');
      expect(first.headers.etag).toBeDefined();

      const second = await request(app).get('/entries').expect(200);
      expect(second.headers['x-cache']).toBe('HIT');
      expect(second.body).toEqual(first.body);

      expect(calls()).toBe(1);
    });

    test('should answer 304 when the client already has the ETag', async () => {
      const { app } = appWith(cacheMiddleware('short'));

      const first = await request(app).get('/entries').expect(200);

      await request(app).get('/entries').set('If-None-Match', first.headers.etag).expect(304);
    });

    test('should never cache an authenticated request', async () => {
      // Responses vary by role and the key has no notion of who asked, so an
      // authenticated response in the cache is one user's data served to
      // another.
      const { app, calls } = appWith(cacheMiddleware('short'));

      await request(app).get('/entries').set('Authorization', 'Bearer token-a').expect(200);
      const second = await request(app)
        .get('/entries')
        .set('Authorization', 'Bearer token-b')
        .expect(200);

      expect(calls()).toBe(2);
      expect(second.headers['x-cache']).toBeUndefined();
      expect(getCacheStats().tiers.short.keys).toBe(0);
    });

    test('should not let an anonymous request be answered from an authenticated one', async () => {
      const { app } = appWith(cacheMiddleware('short'));

      await request(app).get('/entries').set('Authorization', 'Bearer token-a').expect(200);

      const anonymous = await request(app).get('/entries').expect(200);

      expect(anonymous.headers['x-cache']).toBe('MISS');
    });

    test('should only cache GET', async () => {
      const { app, calls } = appWith(cacheMiddleware('short'));

      await request(app).post('/entries').expect(200);
      await request(app).post('/entries').expect(200);

      expect(calls()).toBe(2);
    });

    test('should not cache a non-2xx response', async () => {
      const { app, calls } = appWith(cacheMiddleware('short'), { status: 404 });

      const first = await request(app).get('/entries').expect(404);
      expect(first.headers['x-cache']).toBe('SKIP');

      await request(app).get('/entries').expect(404);
      expect(calls()).toBe(2);
    });

    test('should respect a condition predicate', async () => {
      const { app, calls } = appWith(
        cacheMiddleware('short', { condition: (req) => Boolean(req.query.search) })
      );

      await request(app).get('/entries').expect(200);
      await request(app).get('/entries').expect(200);
      expect(calls()).toBe(2);

      await request(app).get('/entries?search=alma').expect(200);
      const cached = await request(app).get('/entries?search=alma').expect(200);
      expect(cached.headers['x-cache']).toBe('HIT');
      expect(calls()).toBe(3);
    });

    test('should only cache a search under the search preset', async () => {
      const { app, calls } = appWith(presets.search);

      await request(app).get('/entries').expect(200);
      await request(app).get('/entries').expect(200);

      expect(calls()).toBe(2);
    });

    test('should sweep every tier when entries change', async () => {
      // The previous implementation only cleared the medium tier, so an edit
      // left the search results and the statistics serving deleted data until
      // their TTL ran out.
      const short = appWith(cacheMiddleware('short'));
      const medium = appWith(cacheMiddleware('medium'));
      const long = appWith(cacheMiddleware('long'));

      await request(short.app).get('/entries').expect(200);
      await request(medium.app).get('/entries').expect(200);
      await request(long.app).get('/entries').expect(200);

      const before = getCacheStats().tiers;
      expect(before.short.keys).toBe(1);
      expect(before.medium.keys).toBe(1);
      expect(before.long.keys).toBe(1);

      expect(invalidateCache.entries()).toBe(3);

      const after = getCacheStats().tiers;
      expect(after.short.keys).toBe(0);
      expect(after.medium.keys).toBe(0);
      expect(after.long.keys).toBe(0);
    });

    test('should leave unrelated keys alone when invalidating by path', async () => {
      const app = express();
      app.get('/entries', cacheMiddleware('short'), (req, res) => res.json({ a: 1 }));
      app.get('/other', cacheMiddleware('short'), (req, res) => res.json({ b: 2 }));

      await request(app).get('/entries').expect(200);
      await request(app).get('/other').expect(200);

      expect(getCacheStats().tiers.short.keys).toBe(2);
      expect(invalidateCache.byPath('/other')).toBe(1);
      expect(getCacheStats().tiers.short.keys).toBe(1);
    });

    test('should report hit ratio and per-tier key counts', async () => {
      const { app } = appWith(cacheMiddleware('short'));

      await request(app).get('/entries').expect(200);
      await request(app).get('/entries').expect(200);

      const stats = getCacheStats();

      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
      expect(stats.hitRatio).toBeGreaterThan(0);
      expect(stats.hitRatio).toBeLessThanOrEqual(1);
      expect(Object.keys(stats.tiers)).toEqual(['short', 'medium', 'long']);
    });
  });
});
