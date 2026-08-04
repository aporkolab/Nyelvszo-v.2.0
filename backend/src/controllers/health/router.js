const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { catchAsync } = require('../../middleware/errorHandler');
const { authenticate, authorize } = require('../../models/auth/authenticate');
const { getCacheStats } = require('../../middleware/cache');
const { ADMIN_ROLES } = require('../../constants/roles');

const serverStartTime = Date.now();

const DB_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Ping the database and report connectivity.
 *
 * @returns {Promise<{status: string, connected: boolean, responseTimeMs?: number}>} Result.
 */
const checkDatabase = async () => {
  const readyState = mongoose.connection.readyState;
  const status = DB_STATES[readyState] || 'unknown';

  if (readyState !== 1) {
    return { status, connected: false };
  }

  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    return { status, connected: true, responseTimeMs: Date.now() - start };
  } catch {
    return { status: 'error', connected: false };
  }
};

/**
 * Liveness probe.
 *
 * Answers "is this process running?" and nothing more, so a database outage
 * does not cause the orchestrator to restart an otherwise healthy container.
 *
 * @route GET /health/live
 * @access Public
 */
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Readiness probe.
 *
 * Answers "can this process serve traffic?" — which requires the database.
 *
 * @route GET /health/ready
 * @access Public
 */
router.get(
  '/ready',
  catchAsync(async (req, res) => {
    const database = await checkDatabase();
    res.status(database.connected ? 200 : 503).json({
      status: database.connected ? 'ok' : 'unavailable',
      database: database.status,
    });
  })
);

/**
 * Public health summary.
 *
 * Deliberately terse. The previous implementation returned the Node version,
 * process memory, environment name and collection count to anonymous callers,
 * all of which is reconnaissance material and none of which a public consumer
 * needs.
 *
 * @route GET /health
 * @access Public
 */
router.get(
  '/',
  catchAsync(async (req, res) => {
    const database = await checkDatabase();
    const healthy = database.connected;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  })
);

/**
 * Operational detail for administrators.
 *
 * @route GET /health/detailed
 * @access Admin
 */
router.get(
  '/detailed',
  authenticate,
  authorize(ADMIN_ROLES),
  catchAsync(async (req, res) => {
    const database = await checkDatabase();
    const memory = process.memoryUsage();
    const toMb = (bytes) => Math.round((bytes / 1024 / 1024) * 100) / 100;

    res.status(database.connected ? 200 : 503).json({
      status: database.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: require('../../../package.json').version,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      startedAt: new Date(serverStartTime).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database,
      memory: {
        rssMb: toMb(memory.rss),
        heapTotalMb: toMb(memory.heapTotal),
        heapUsedMb: toMb(memory.heapUsed),
      },
      cache: getCacheStats(),
    });
  })
);

module.exports = router;
