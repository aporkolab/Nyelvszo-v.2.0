const logger = require('../logger/logger');

// Fields that must never reach a log file, in any shape. The previous
// implementation logged `JSON.stringify(req.body)` verbatim, which wrote every
// failed login's plaintext password into a 30-day rotating log.
const REDACTED_FIELDS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordconfirm',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'apikey',
]);

const REDACTED = '[REDACTED]';

/**
 * Deep-copy a value, replacing sensitive fields with a placeholder.
 *
 * @param {*} value - Value to redact.
 * @param {number} [depth] - Current recursion depth.
 * @returns {*} Redacted copy.
 */
const redact = (value, depth = 0) => {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }

  return Object.entries(value).reduce((acc, [key, val]) => {
    acc[key] = REDACTED_FIELDS.has(key.toLowerCase()) ? REDACTED : redact(val, depth + 1);
    return acc;
  }, {});
};

/**
 * Application error carrying an HTTP status and an optional detail payload.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable message, safe to return to clients.
   * @param {number} [statusCode] - HTTP status code.
   * @param {string} [type] - Machine-readable error type.
   * @param {object} [options] - Extra options.
   * @param {Array} [options.details] - Field-level details.
   */
  constructor(message, statusCode = 500, type = 'ApplicationError', options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.type = type;
    this.isOperational = true;
    if (options.details) {
      this.details = options.details;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Decide whether an error is safe to surface to the client.
 *
 * `http-errors` instances (used throughout the auth and routing layers) carry
 * `expose: true` for 4xx but no `isOperational` flag. Treating only
 * `isOperational` as trustworthy meant every 401 and 404 was reported to
 * production clients as a 500.
 *
 * @param {Error} err - Error to classify.
 * @returns {boolean} Whether the message may be returned as-is.
 */
const isClientSafe = (err) => {
  if (err.isOperational) return true;
  if (err.expose === true) return true;
  const status = err.statusCode || err.status;
  return typeof status === 'number' && status >= 400 && status < 500;
};

const buildBaseResponse = (err, req, statusCode) => ({
  error: err.message,
  statusCode,
  type: err.type || 'Error',
  timestamp: new Date().toISOString(),
  path: req.originalUrl || req.url,
  ...(err.details && { details: err.details }),
});

/**
 * Map MongoDB and Mongoose errors onto AppError instances.
 *
 * @param {Error} err - Raw driver or Mongoose error.
 * @returns {Error} Normalised error.
 */
const handleMongoError = (err) => {
  if (err.name === 'CastError') {
    return new AppError(`Invalid value for ${err.path}`, 400, 'ValidationError');
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return new AppError(`Duplicate value for ${field}`, 409, 'DuplicateError');
  }

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
    }));

    return new AppError('Validation failed', 400, 'ValidationError', { details });
  }

  if (err.name === 'DocumentNotFoundError') {
    return new AppError('Document not found', 404, 'NotFoundError');
  }

  return err;
};

/**
 * Map jsonwebtoken errors onto AppError instances.
 *
 * @param {Error} err - Raw JWT error.
 * @returns {Error} Normalised error.
 */
const handleJWTError = (err) => {
  switch (err.name) {
    case 'JsonWebTokenError':
      return new AppError('Invalid token. Please log in again.', 401, 'AuthenticationError');
    case 'TokenExpiredError':
      return new AppError(
        'Your token has expired. Please log in again.',
        401,
        'AuthenticationError'
      );
    case 'NotBeforeError':
      return new AppError('Token not active. Please log in again.', 401, 'AuthenticationError');
    default:
      return err;
  }
};

/**
 * Global error handling middleware.
 *
 * @param {Error} err - Error passed to next().
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {function} _next - Unused, but required for Express to treat this as an error handler.
 */
const errorHandler = (err, req, res, _next) => {
  let error = err;

  if (err.name === 'CastError' || err.name === 'ValidationError' || err.code === 11000) {
    error = handleMongoError(err);
  } else if (
    err.name === 'JsonWebTokenError' ||
    err.name === 'TokenExpiredError' ||
    err.name === 'NotBeforeError'
  ) {
    error = handleJWTError(err);
  }

  const statusCode = error.statusCode || error.status || 500;
  const clientSafe = isClientSafe(error);

  const logContext = {
    url: req.originalUrl || req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode,
    ...(req.user && { userId: req.user.userId, userEmail: req.user.email }),
    ...(req.body && Object.keys(req.body).length > 0 && { requestBody: redact(req.body) }),
  };

  if (statusCode >= 500) {
    logger.logError(error, logContext);
  } else {
    logger.warn(error.message, logContext);
  }

  const includeDebugInfo =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  if (clientSafe) {
    const body = buildBaseResponse(error, req, statusCode);
    if (includeDebugInfo) {
      body.stack = error.stack;
    }
    return res.status(statusCode).json(body);
  }

  // Unexpected failure: never leak the message or the stack to a client.
  const body = {
    error: includeDebugInfo ? error.message : 'Something went wrong',
    statusCode: 500,
    type: 'InternalServerError',
    timestamp: new Date().toISOString(),
    path: req.originalUrl || req.url,
    ...(includeDebugInfo && { stack: error.stack }),
  };

  res.status(500).json(body);
};

/**
 * Terminal handler for unmatched routes.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {function} next - Express next callback.
 */
const notFoundHandler = (req, res, next) => {
  next(new AppError(`Cannot ${req.method} ${req.originalUrl}`, 404, 'NotFoundError'));
};

/**
 * Wrap an async route handler so rejections reach the error middleware.
 *
 * @param {function} fn - Async handler.
 * @returns {function} Express handler.
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const createValidationError = (message, details = []) =>
  new AppError(message, 400, 'ValidationError', { details });

const createAuthError = (message = 'Authentication required') =>
  new AppError(message, 401, 'AuthenticationError');

const createForbiddenError = (message = 'Access forbidden') =>
  new AppError(message, 403, 'ForbiddenError');

const createNotFoundError = (resource = 'Resource') =>
  new AppError(`${resource} not found`, 404, 'NotFoundError');

/**
 * 409 for a state conflict.
 *
 * @param {string} message - Message safe to show the user.
 * @param {string} [type] - Machine-readable discriminator. A client cannot tell
 *   "this email is taken" from "you cannot remove the last administrator" by
 *   status code alone, and guessing from the prose means the admin editor
 *   reports an account-policy refusal on the email field.
 * @returns {AppError} The error.
 */
const createConflictError = (message, type = 'ConflictError') => new AppError(message, 409, type);

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  catchAsync,
  redact,
  createValidationError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createConflictError,
};
