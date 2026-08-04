const crypto = require('crypto');
const NodeCache = require('node-cache');
const logger = require('../logger/logger');

const TIERS = {
  // Search results: change on every edit, so keep them brief.
  short: new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false, maxKeys: 1000 }),
  // Individual entries.
  medium: new NodeCache({ stdTTL: 900, checkperiod: 120, useClones: false, maxKeys: 500 }),
  // Aggregates and rarely-changing lists.
  long: new NodeCache({ stdTTL: 3600, checkperiod: 300, useClones: false, maxKeys: 200 }),
};

const stats = { hits: 0, misses: 0, sets: 0, errors: 0 };

/**
 * Build a cache key from the request.
 *
 * Only the method, path and query participate. Anything user-specific is
 * excluded because the middleware refuses to cache authenticated responses at
 * all — mixing the two is how one user's data ends up in another's response.
 *
 * @param {object} req - Express request.
 * @returns {string} Cache key.
 */
const generateCacheKey = (req) => {
  const query = Object.keys(req.query)
    .sort()
    .map((key) => `${key}=${req.query[key]}`)
    .join('&');

  // `req.baseUrl + req.path`, not `req.path`. Inside a router mounted at
  // /entries, `req.path` is only the portion after the mount point — "/" for
  // the collection — so the key never contained the word "entries" and
  // `invalidateByPath('/entries')` matched nothing. Edits stayed invisible to
  // anonymous readers until the TTL expired.
  return `${req.method}:${req.baseUrl || ''}${req.path}?${query}`;
};

/**
 * Response-caching middleware factory.
 *
 * @param {'short'|'medium'|'long'} [tier] - Which cache to store in.
 * @param {object} [options] - Options.
 * @param {function} [options.condition] - Predicate deciding whether to cache this request.
 * @returns {function} Express middleware.
 */
const cacheMiddleware = (tier = 'medium', options = {}) => {
  const { condition = () => true } = options;
  const store = TIERS[tier];

  return (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    // Never serve a cached body to — or store one from — an authenticated
    // request. Responses can vary by role, and the cache has no notion of who
    // asked.
    if (req.method !== 'GET' || req.headers.authorization || !condition(req)) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    let cached;
    try {
      cached = store.get(cacheKey);
    } catch (error) {
      stats.errors++;
      logger.warn('Cache read failed', { error: error.message });
      return next();
    }

    if (cached) {
      stats.hits++;
      res.set({
        'X-Cache': 'HIT',
        'Cache-Control': `public, max-age=${store.options.stdTTL}`,
        ETag: cached.etag,
      });

      if (req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end();
      }

      return res.status(200).json(cached.body);
    }

    stats.misses++;

    const originalJson = res.json.bind(res);

    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const etag = `"${crypto.createHash('sha1').update(JSON.stringify(body)).digest('base64')}"`;
          store.set(cacheKey, { body, etag });
          stats.sets++;

          res.set({
            'X-Cache': 'MISS',
            'Cache-Control': `public, max-age=${store.options.stdTTL}`,
            ETag: etag,
          });
        } catch (error) {
          stats.errors++;
          logger.warn('Cache write failed', { error: error.message, key: cacheKey });
        }
      } else {
        res.set('X-Cache', 'SKIP');
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Drop every key whose path starts with the given prefix.
 *
 * Sweeps all three tiers. The previous implementation only touched `medium`,
 * so entry writes left the search results (`short`) and the statistics
 * (`long`) serving deleted data until their TTL expired.
 *
 * @param {string} pathPrefix - Path prefix, e.g. "/entries".
 * @returns {number} Number of keys removed.
 */
const invalidateByPath = (pathPrefix) => {
  let removed = 0;

  Object.values(TIERS).forEach((store) => {
    const matching = store.keys().filter((key) => key.includes(pathPrefix));
    matching.forEach((key) => store.del(key));
    removed += matching.length;
  });

  if (removed > 0) {
    logger.debug('Cache invalidated', { pathPrefix, removed });
  }

  return removed;
};

const invalidateCache = {
  all: () => {
    Object.values(TIERS).forEach((store) => store.flushAll());
    logger.debug('All caches cleared');
  },
  entries: () => invalidateByPath('/entries'),
  byPath: invalidateByPath,
};

/**
 * Snapshot of cache counters, for the admin health endpoint.
 *
 * @returns {object} Hit/miss counters plus per-tier key counts.
 */
const getCacheStats = () => {
  const total = stats.hits + stats.misses;

  return {
    ...stats,
    hitRatio: total > 0 ? Number((stats.hits / total).toFixed(3)) : 0,
    tiers: Object.entries(TIERS).reduce((acc, [name, store]) => {
      acc[name] = { keys: store.keys().length };
      return acc;
    }, {}),
  };
};

/**
 * Release every cache timer.
 *
 * NodeCache schedules a recurring `checkperiod` timer that keeps the event
 * loop alive; without this the test runner hangs on exit.
 */
const closeCaches = () => {
  Object.values(TIERS).forEach((store) => store.close());
};

const presets = {
  // Only cache actual searches; an unfiltered listing is cheap and changes often.
  search: cacheMiddleware('short', {
    condition: (req) => Boolean(req.query.search),
  }),
  entries: cacheMiddleware('medium'),
  statistics: cacheMiddleware('long'),
  public: cacheMiddleware('long'),
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  getCacheStats,
  closeCaches,
  presets,
  generateCacheKey,
};
