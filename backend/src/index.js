require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');

const logger = require('./logger/logger');

// Minimum entropy for a signing secret. A short secret is brute-forceable
// offline, and the failure mode of an unset one used to be a 500 on every
// authenticated request rather than a refusal to start.
const MIN_SECRET_LENGTH = 32;

/**
 * Validate required configuration before anything binds a port.
 *
 * Exits with a non-zero status and an actionable message rather than starting
 * a server that will fail on its first authenticated request.
 */
const assertEnvironment = () => {
  const problems = [];

  ['JWT_SECRET', 'JWT_REFRESH_SECRET'].forEach((name) => {
    const value = process.env[name];
    if (!value) {
      problems.push(`${name} is not set`);
    } else if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
    }
  });

  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
  }

  if (!process.env.MONGODB_URI && !process.env.DB_HOST) {
    problems.push('neither MONGODB_URI nor DB_HOST is set');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
    problems.push('ALLOWED_ORIGINS must be set explicitly in production');
  }

  if (problems.length) {
    logger.error('Refusing to start — invalid configuration', { problems });
    // eslint-disable-next-line no-console
    console.error(
      `\nCannot start NyelvSzó API:\n${problems.map((p) => `  - ${p}`).join('\n')}\n\n` +
        'See .env.example for the expected variables. Generate secrets with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"\n"
    );
    process.exit(1);
  }
};

assertEnvironment();

const app = require('./server');

const port = Number.parseInt(process.env.PORT, 10) || 3000;
const server = http.createServer(app);

server.listen(port, () => {
  logger.info('NyelvSzó API started', {
    port,
    mode: process.env.NODE_ENV || 'development',
    documentation: `http://localhost:${port}/api-docs`,
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
//
// Container runtimes send SIGTERM and then SIGKILL after a grace period.
// Without a handler, in-flight requests are severed and the Mongo connection is
// dropped mid-write on every deploy.
// ---------------------------------------------------------------------------
const SHUTDOWN_TIMEOUT_MS = 10000;
let shuttingDown = false;

/**
 * Stop accepting connections, drain in-flight work, then exit.
 *
 * @param {string} signal - Signal that triggered the shutdown.
 */
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down`);

  // Hard deadline: if a long-lived request refuses to finish, exit anyway
  // rather than waiting to be killed.
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (err) => {
    if (err) {
      logger.error('Error while closing HTTP server', { error: err.message });
    }

    try {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed');
    } catch (closeError) {
      logger.error('Error while closing MongoDB connection', { error: closeError.message });
    }

    clearTimeout(forceExit);
    process.exit(err ? 1 : 0);
  });
};

['SIGTERM', 'SIGINT'].forEach((signal) => process.on(signal, () => shutdown(signal)));

module.exports = server;
