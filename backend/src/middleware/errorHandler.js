const createError = require('http-errors');
const logger = require('../logger/logger');

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, type = 'ApplicationError') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.type = type;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Development error response with full details
 */
const sendErrorDev = (err, req, res) => {
  const errorResponse = {
    error: err.message,
    statusCode: err.statusCode || 500,
    type: err.type || 'InternalServerError',
    timestamp: new Date().toISOString(),
    path: req.originalUrl || req.url,
    method: req.method,
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      name: err.name
    })
  };

  res.status(err.statusCode || 500).json(errorResponse);
};

/**
 * Production error response with minimal details
 */
const sendErrorProd = (err, req, res) => {
  // Operational, trusted errors: send message to client
  if (err.isOperational) {
    const errorResponse = {
      error: err.message,
      statusCode: err.statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url,
      ...(err.details && { details: err.details })
    };

    res.status(err.statusCode).json(errorResponse);
  } else {
    // Programming or other unknown errors: don't leak error details
    logger.error('Unknown error occurred', {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl || req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      ...(req.user && { userId: req.user.userId })
    });

    res.status(500).json({
      error: 'Something went wrong!',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url
    });
  }
};

/**
 * Handle specific MongoDB errors
 */
const handleMongoError = (err) => {
  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}`;
    return new AppError(message, 400, 'ValidationError');
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `Duplicate field value: ${field} = '${value}'. Please use another value.`;
    return new AppError(message, 409, 'DuplicateError');
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message,
      value: val.value
    }));

    return new AppError('Validation failed', 400, 'ValidationError', { details: errors });
  }

  if (err.name === 'DocumentNotFoundError') {
    return new AppError('Document not found', 404, 'NotFoundError');
  }

  return err;
};

/**
 * Handle JWT errors
 */
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return new AppError('Invalid token. Please log in again.', 401, 'AuthenticationError');
  }

  if (err.name === 'TokenExpiredError') {
    return new AppError('Your token has expired. Please log in again.', 401, 'AuthenticationError');
  }

  if (err.name === 'NotBeforeError') {
    return new AppError('Token not active. Please log in again.', 401, 'AuthenticationError');
  }

  return err;
};

/**
 * Handle validation errors
 */
const handleValidationError = (err) => {
  if (err.type === 'ValidationError' && err.details) {
    return new AppError(err.message, 400, 'ValidationError', { details: err.details });
  }

  return err;
};

/**
 * Handle rate limit errors
 */
const handleRateLimitError = (err) => {
  if (err.type === 'RateLimitError') {
    return new AppError(
      'Too many requests from this IP. Please try again later.',
      429,
      'RateLimitError',
      { retryAfter: err.retryAfter }
    );
  }

  return err;
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Set default error properties
  err.statusCode = err.statusCode || err.status || 500;
  err.status = err.status || 'error';

  // Log the error
  const logContext = {
    url: req.originalUrl || req.url,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    ...(req.user && {
      userId: req.user.userId,
      userEmail: req.user.email
    }),
    ...(req.body && Object.keys(req.body).length > 0 && {
      requestBody: JSON.stringify(req.body)
    }),
    statusCode: err.statusCode
  };

  logger.logError(err, logContext);

  // Handle different error types
  let error = { ...err };
  error.message = err.message;

  // MongoDB errors
  if (err.name === 'CastError' || err.name === 'ValidationError' || err.code === 11000) {
    error = handleMongoError(err);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
    error = handleJWTError(err);
  }

  // Validation errors
  if (err.type === 'ValidationError') {
    error = handleValidationError(err);
  }

  // Rate limit errors
  if (err.type === 'RateLimitError') {
    error = handleRateLimitError(err);
  }

  // Send error response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * Catch-all handler for unhandled routes
 */
const notFoundHandler = (req, res, next) => {
  const err = new AppError(
    `Can't find ${req.originalUrl} on this server!`,
    404,
    'NotFoundError'
  );

  logger.warn('Route not found', {
    url: req.originalUrl || req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  next(err);
};

/**
 * Async error wrapper for route handlers
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Validation error creator
 */
const createValidationError = (message, details = []) => {
  const error = new AppError(message, 400, 'ValidationError');
  error.details = details;
  return error;
};

/**
 * Authorization error creator
 */
const createAuthError = (message = 'Authentication required') => {
  return new AppError(message, 401, 'AuthenticationError');
};

/**
 * Forbidden error creator
 */
const createForbiddenError = (message = 'Access forbidden') => {
  return new AppError(message, 403, 'ForbiddenError');
};

/**
 * Not found error creator
 */
const createNotFoundError = (resource = 'Resource') => {
  return new AppError(`${resource} not found`, 404, 'NotFoundError');
};

/**
 * Conflict error creator
 */
const createConflictError = (message) => {
  return new AppError(message, 409, 'ConflictError');
};

/**
 * Rate limit error creator
 */
const createRateLimitError = (message = 'Too many requests', retryAfter) => {
  const error = new AppError(message, 429, 'RateLimitError');
  if (retryAfter) {
    error.retryAfter = retryAfter;
  }
  return error;
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  catchAsync,
  createValidationError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createConflictError,
  createRateLimitError
};
