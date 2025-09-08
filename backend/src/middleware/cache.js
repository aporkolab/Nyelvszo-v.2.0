const NodeCache = require('node-cache');
const logger = require('../logger/logger');

// Create cache instances with different TTL settings
const cache = {
  // Short-term cache for frequently accessed data (5 minutes)
  short: new NodeCache({ 
    stdTTL: 300, // 5 minutes
    checkperiod: 60, // Check for expired keys every 60 seconds
    useClones: false, // Don't clone objects for better performance
    maxKeys: 1000 // Maximum number of keys
  }),
  
  // Medium-term cache for search results (15 minutes)
  medium: new NodeCache({ 
    stdTTL: 900, // 15 minutes
    checkperiod: 120,
    useClones: false,
    maxKeys: 500
  }),
  
  // Long-term cache for static data (1 hour)
  long: new NodeCache({ 
    stdTTL: 3600, // 1 hour
    checkperiod: 300,
    useClones: false,
    maxKeys: 100
  })
};

// Cache statistics
let cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0
};

// Event listeners for monitoring
Object.values(cache).forEach(cacheInstance => {
  cacheInstance.on('set', (key, value) => {
    cacheStats.sets++;
    logger.debug('Cache SET', { key, size: JSON.stringify(value).length });
  });

  cacheInstance.on('del', (key, value) => {
    cacheStats.deletes++;
    logger.debug('Cache DELETE', { key });
  });

  cacheInstance.on('expired', (key, value) => {
    logger.debug('Cache EXPIRED', { key });
  });

  cacheInstance.on('flush', () => {
    logger.info('Cache FLUSH');
  });
});

/**
 * Generate cache key from request parameters
 */
const generateCacheKey = (req) => {
  const { method, originalUrl, query, user } = req;
  const userRole = user?.role || 'anonymous';
  
  // Create a deterministic key from request parameters
  const keyData = {
    method,
    url: originalUrl,
    query: Object.keys(query).sort().reduce((obj, key) => {
      obj[key] = query[key];
      return obj;
    }, {}),
    userRole
  };

  return Buffer.from(JSON.stringify(keyData)).toString('base64');
};

/**
 * Cache middleware factory
 */
const cacheMiddleware = (duration = 'medium', options = {}) => {
  const {
    keyGenerator = generateCacheKey,
    condition = () => true,
    skipCache = false,
    varyBy = []
  } = options;

  return (req, res, next) => {
    // Skip caching in development or if explicitly disabled
    if (process.env.NODE_ENV === 'development' || skipCache) {
      return next();
    }

    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition
    if (!condition(req)) {
      return next();
    }

    try {
      // Generate cache key
      let cacheKey = keyGenerator(req);
      
      // Add vary-by parameters to key
      if (varyBy.length > 0) {
        const varyData = varyBy.reduce((obj, key) => {
          obj[key] = req[key] || req.headers[key] || req.query[key];
          return obj;
        }, {});
        cacheKey += '_' + Buffer.from(JSON.stringify(varyData)).toString('base64');
      }

      // Try to get from cache
      const cachedData = cache[duration].get(cacheKey);

      if (cachedData) {
        cacheStats.hits++;
        
        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey.substring(0, 16) + '...',
          'Cache-Control': `public, max-age=${cache[duration].options.stdTTL}`,
          'ETag': cachedData.etag
        });

        logger.performance('Cache HIT', {
          key: cacheKey.substring(0, 32),
          url: req.originalUrl,
          method: req.method
        });

        return res.status(cachedData.statusCode || 200).json(cachedData.data);
      }

      cacheStats.misses++;

      // Intercept response
      const originalJson = res.json;
      const originalStatus = res.status;
      let responseData;
      let statusCode = 200;

      // Override status method
      res.status = function(code) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json method
      res.json = function(data) {
        responseData = data;

        // Only cache successful responses
        if (statusCode >= 200 && statusCode < 300) {
          try {
            const etag = require('crypto')
              .createHash('md5')
              .update(JSON.stringify(data))
              .digest('hex');

            const cacheData = {
              data,
              statusCode,
              etag,
              cachedAt: new Date().toISOString()
            };

            cache[duration].set(cacheKey, cacheData);

            res.set({
              'X-Cache': 'MISS',
              'X-Cache-Key': cacheKey.substring(0, 16) + '...',
              'Cache-Control': `public, max-age=${cache[duration].options.stdTTL}`,
              'ETag': etag
            });

            logger.performance('Cache MISS - Stored', {
              key: cacheKey.substring(0, 32),
              url: req.originalUrl,
              method: req.method,
              statusCode
            });

          } catch (error) {
            cacheStats.errors++;
            logger.warn('Cache storage error', {
              error: error.message,
              key: cacheKey.substring(0, 32)
            });
          }
        } else {
          res.set('X-Cache', 'SKIP');
          logger.debug('Cache SKIP - Non-success status', {
            statusCode,
            url: req.originalUrl
          });
        }

        return originalJson.call(this, data);
      };

      next();

    } catch (error) {
      cacheStats.errors++;
      logger.error('Cache middleware error', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl
      });
      
      // Continue without caching on error
      next();
    }
  };
};

/**
 * Cache invalidation helpers
 */
const invalidateCache = {
  // Clear all caches
  all: () => {
    Object.values(cache).forEach(c => c.flushAll());
    logger.audit('All caches cleared');
  },

  // Clear cache by pattern
  byPattern: (pattern, cacheType = 'medium') => {
    const keys = cache[cacheType].keys();
    const matchingKeys = keys.filter(key => 
      Buffer.from(key, 'base64').toString().includes(pattern)
    );
    
    matchingKeys.forEach(key => cache[cacheType].del(key));
    logger.audit('Cache cleared by pattern', { pattern, count: matchingKeys.length });
    return matchingKeys.length;
  },

  // Clear cache by URL pattern
  byUrl: (urlPattern, cacheType = 'medium') => {
    return invalidateCache.byPattern(urlPattern, cacheType);
  },

  // Clear specific entries-related cache
  entries: () => {
    const cleared = invalidateCache.byPattern('/entries');
    logger.audit('Entries cache cleared', { count: cleared });
    return cleared;
  },

  // Clear users-related cache
  users: () => {
    const cleared = invalidateCache.byPattern('/users');
    logger.audit('Users cache cleared', { count: cleared });
    return cleared;
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  const stats = { ...cacheStats };
  
  // Add cache-specific stats
  Object.entries(cache).forEach(([name, cacheInstance]) => {
    stats[name] = {
      keys: cacheInstance.keys().length,
      hits: cacheInstance.getStats().hits,
      misses: cacheInstance.getStats().misses,
      keys_count: cacheInstance.getStats().keys,
      hits_ratio: cacheInstance.getStats().hits / (cacheInstance.getStats().hits + cacheInstance.getStats().misses) || 0
    };
  });

  stats.overall_hit_ratio = stats.hits / (stats.hits + stats.misses) || 0;
  return stats;
};

/**
 * Warmup cache with frequently accessed data
 */
const warmupCache = async () => {
  try {
    logger.info('Starting cache warmup');
    
    // This would be called on server startup
    // Add your most frequently accessed data here
    
    logger.info('Cache warmup completed');
  } catch (error) {
    logger.error('Cache warmup failed', { error: error.message });
  }
};

/**
 * Preset middleware configurations
 */
const presets = {
  // For search results that change frequently
  search: cacheMiddleware('short', {
    condition: (req) => req.query.search || req.query.q,
    varyBy: ['accept-language']
  }),

  // For entry details that don't change often
  entries: cacheMiddleware('medium', {
    condition: (req) => req.method === 'GET'
  }),

  // For statistics and aggregated data
  statistics: cacheMiddleware('long', {
    condition: (req) => req.url.includes('statistics') || req.url.includes('stats')
  }),

  // For public data that rarely changes
  public: cacheMiddleware('long', {
    condition: (req) => !req.user || req.user.role === 1
  })
};

module.exports = {
  cache,
  cacheMiddleware,
  invalidateCache,
  getCacheStats,
  warmupCache,
  presets,
  generateCacheKey
};
