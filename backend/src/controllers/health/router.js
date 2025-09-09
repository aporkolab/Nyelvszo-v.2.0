const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const logger = require('../../logger/logger');
const { catchAsync } = require('../../middleware/errorHandler');

// Store server start time
const serverStartTime = Date.now();

/**
 * Basic health check endpoint
 * @route GET /health
 * @access Public
 */
router.get(
  '/',
  catchAsync(async (req, res) => {
    const healthCheck = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '2.2.0',
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development',
      server_start_time: new Date(serverStartTime).toISOString(),
    };

    // Check database connectivity
    try {
      const dbStatus = mongoose.connection.readyState;
      const dbStates = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
      };

      healthCheck.database = {
        status: dbStates[dbStatus] || 'unknown',
        connected: dbStatus === 1,
      };

      // If connected, test with a simple query
      if (dbStatus === 1) {
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        const responseTime = Date.now() - start;

        healthCheck.database.responseTime = `${responseTime}ms`;
        healthCheck.database.collections = await mongoose.connection.db
          .listCollections()
          .toArray()
          .then((collections) => collections.length);
      }
    } catch (error) {
      healthCheck.database = {
        status: 'error',
        connected: false,
        error: error.message,
      };
      healthCheck.status = 'ERROR';
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    healthCheck.memory = {
      rss: `${Math.round((memUsage.rss / 1024 / 1024) * 100) / 100} MB`,
      heapTotal: `${Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100} MB`,
      heapUsed: `${Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100} MB`,
      external: `${Math.round((memUsage.external / 1024 / 1024) * 100) / 100} MB`,
      usage: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`,
    };

    // CPU usage (approximation)
    const startUsage = process.cpuUsage();
    setTimeout(() => {
      const cpuUsage = process.cpuUsage(startUsage);
      healthCheck.cpu = {
        user: cpuUsage.user,
        system: cpuUsage.system,
      };
    }, 100);

    // Set appropriate status code
    const statusCode = healthCheck.status === 'OK' ? 200 : 503;

    // Log health check for monitoring
    logger.performance('Health check performed', {
      status: healthCheck.status,
      dbConnected: healthCheck.database?.connected,
      memoryUsage: healthCheck.memory.usage,
      uptime: healthCheck.uptime,
    });

    res.status(statusCode).json(healthCheck);
  })
);

/**
 * Detailed health check with more comprehensive checks
 * @route GET /health/detailed
 * @access Public
 */
router.get(
  '/detailed',
  catchAsync(async (req, res) => {
    const detailedHealth = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '2.2.0',
      checks: {},
    };

    const checks = [];

    // Database health check
    checks.push(
      new Promise(async (resolve) => {
        try {
          const start = Date.now();
          const dbStatus = mongoose.connection.readyState;

          if (dbStatus === 1) {
            await mongoose.connection.db.admin().ping();
            const responseTime = Date.now() - start;

            // Test a simple query
            const collections = await mongoose.connection.db.listCollections().toArray();

            resolve({
              name: 'database',
              status: 'healthy',
              responseTime: `${responseTime}ms`,
              details: {
                connected: true,
                collections: collections.length,
                host: mongoose.connection.host,
                port: mongoose.connection.port,
                name: mongoose.connection.name,
              },
            });
          } else {
            resolve({
              name: 'database',
              status: 'unhealthy',
              details: {
                connected: false,
                state: dbStatus,
              },
            });
          }
        } catch (error) {
          resolve({
            name: 'database',
            status: 'unhealthy',
            error: error.message,
            details: {
              connected: false,
            },
          });
        }
      })
    );

    // Memory health check
    checks.push(
      new Promise((resolve) => {
        const memUsage = process.memoryUsage();
        const totalMem = require('os').totalmem();
        const freeMem = require('os').freemem();

        const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        const systemMemoryUsagePercent = ((totalMem - freeMem) / totalMem) * 100;

        resolve({
          name: 'memory',
          status: memoryUsagePercent > 90 ? 'warning' : 'healthy',
          details: {
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
            heapUsagePercent: `${Math.round(memoryUsagePercent)}%`,
            systemTotal: `${Math.round(totalMem / 1024 / 1024 / 1024)} GB`,
            systemFree: `${Math.round(freeMem / 1024 / 1024 / 1024)} GB`,
            systemUsagePercent: `${Math.round(systemMemoryUsagePercent)}%`,
          },
        });
      })
    );

    // Disk space check
    checks.push(
      new Promise((resolve) => {
        const fs = require('fs');

        try {
          const stats = fs.statSync('./');
          resolve({
            name: 'disk',
            status: 'healthy',
            details: {
              accessible: true,
            },
          });
        } catch (error) {
          resolve({
            name: 'disk',
            status: 'unhealthy',
            error: error.message,
            details: {
              accessible: false,
            },
          });
        }
      })
    );

    // External services health check (if any)
    checks.push(
      new Promise((resolve) => {
        // Add checks for external APIs, Redis, etc.
        resolve({
          name: 'external_services',
          status: 'healthy',
          details: {
            redis: 'not_configured',
            email_service: 'not_configured',
          },
        });
      })
    );

    // Execute all health checks
    const results = await Promise.allSettled(checks);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        detailedHealth.checks[result.value.name] = result.value;

        // Update overall status
        if (result.value.status === 'unhealthy') {
          detailedHealth.status = 'ERROR';
        } else if (result.value.status === 'warning' && detailedHealth.status === 'OK') {
          detailedHealth.status = 'WARNING';
        }
      } else {
        detailedHealth.checks[`check_${index}`] = {
          name: `unknown_${index}`,
          status: 'unhealthy',
          error: result.reason?.message || 'Unknown error',
        };
        detailedHealth.status = 'ERROR';
      }
    });

    // Set appropriate status code
    const statusCode = detailedHealth.status === 'OK' ? 200 : 503;

    // Log detailed health check
    logger.audit('Detailed health check performed', {
      status: detailedHealth.status,
      checks: Object.keys(detailedHealth.checks).length,
      unhealthyChecks: Object.values(detailedHealth.checks).filter(
        (check) => check.status === 'unhealthy'
      ).length,
    });

    res.status(statusCode).json(detailedHealth);
  })
);

/**
 * Liveness probe for Kubernetes
 * @route GET /health/live
 * @access Public
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Readiness probe for Kubernetes
 * @route GET /health/ready
 * @access Public
 */
router.get(
  '/ready',
  catchAsync(async (req, res) => {
    const ready = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // Check if database is ready
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        ready.checks.database = { status: 'ready' };
      } else {
        ready.checks.database = { status: 'not_ready', reason: 'Database not connected' };
        ready.status = 'not_ready';
      }
    } catch (error) {
      ready.checks.database = { status: 'not_ready', reason: error.message };
      ready.status = 'not_ready';
    }

    // Add more readiness checks here if needed

    const statusCode = ready.status === 'ready' ? 200 : 503;
    res.status(statusCode).json(ready);
  })
);

/**
 * Metrics endpoint for monitoring tools
 * @route GET /health/metrics
 * @access Public
 */
router.get(
  '/metrics',
  catchAsync(async (req, res) => {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.env.npm_package_version || '2.2.0',
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development',
    };

    // Database metrics
    if (mongoose.connection.readyState === 1) {
      try {
        const dbStats = await mongoose.connection.db.stats();
        metrics.database = {
          connected: true,
          collections: dbStats.collections,
          objects: dbStats.objects,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          indexes: dbStats.indexes,
          indexSize: dbStats.indexSize,
        };
      } catch (error) {
        metrics.database = {
          connected: false,
          error: error.message,
        };
      }
    } else {
      metrics.database = {
        connected: false,
      };
    }

    // System metrics
    const os = require('os');
    metrics.system = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
    };

    res.json(metrics);
  })
);

module.exports = router;
