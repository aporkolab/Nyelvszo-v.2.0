const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const logger = require('../../logger/logger');
const { ROLES } = require('../../constants/roles');

const JWT_ISSUER = 'nyelvszo-api';
const JWT_AUDIENCE = 'nyelvszo-client';

// jsonwebtoken will happily verify a token whose `alg` header says `none` (or
// an asymmetric algorithm) unless the accepted set is pinned explicitly.
const JWT_ALGORITHMS = ['HS256'];

/**
 * Verify a signed access token and return its claims.
 *
 * Pins issuer, audience and algorithm so a token minted for a different service
 * — or one whose header claims an algorithm we do not use — is rejected.
 *
 * @param {string} token - Raw JWT, without the "Bearer " prefix.
 * @param {string} secret - Signing secret.
 * @returns {object} Decoded payload.
 */
const verifyAccessToken = (token, secret) =>
  jwt.verify(token, secret, {
    algorithms: JWT_ALGORITHMS,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

/**
 * Translate a jsonwebtoken error into the matching HTTP error.
 *
 * @param {Error} error - Error thrown by jwt.verify.
 * @returns {Error} http-errors instance.
 */
const toHttpError = (error) => {
  switch (error.name) {
    case 'TokenExpiredError':
      return createError(401, 'Token has expired');
    case 'NotBeforeError':
      return createError(401, 'Token not active');
    case 'JsonWebTokenError':
      return createError(401, 'Invalid token');
    default:
      return createError(401, 'Authentication failed');
  }
};

/**
 * JWT authentication middleware.
 *
 * On success `req.user` carries the claims plus the freshly loaded account, so
 * downstream handlers never have to trust role information that was true only
 * at sign-in time.
 *
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @param {function} next - Express next callback.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    return next(createError(401, 'Access token is required'));
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    logger.error('JWT_SECRET environment variable is not set');
    return next(createError(500, 'Server configuration error'));
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token, jwtSecret);
  } catch (error) {
    logger.security('JWT verification failed', {
      reason: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    return next(toHttpError(error));
  }

  // A refresh token must never be accepted as an access token: it has a much
  // longer lifetime and is not meant to authorise requests on its own.
  if (decoded.typ !== 'access') {
    logger.security('Non-access token presented as bearer credential', {
      typ: decoded.typ,
      ip: req.ip,
    });
    return next(createError(401, 'Invalid token'));
  }

  // Re-read the account on every request. Without this, deactivating or
  // demoting a user has no effect until their token expires.
  const User = require('../user');
  let account;
  try {
    account = await User.findById(decoded.userId).select('email role isActive');
  } catch (error) {
    return next(error);
  }

  if (!account || !account.isActive) {
    logger.security('Token presented for a missing or deactivated account', {
      userId: decoded.userId,
      ip: req.ip,
    });
    return next(createError(401, 'Account is no longer active'));
  }

  req.user = {
    userId: account._id.toString(),
    email: account.email,
    role: account.role,
    iat: decoded.iat,
    exp: decoded.exp,
  };

  next();
};

/**
 * Role-based authorization middleware factory.
 *
 * Roles are numeric (see constants/roles.js). Membership is exact rather than
 * "at least": pass every role that should be admitted.
 *
 * @param {number|number[]} allowedRoles - Role or roles permitted through.
 * @returns {function} Express middleware.
 */
const authorize = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!roles.length || roles.some((role) => !Object.values(ROLES).includes(role))) {
    throw new TypeError(`authorize() called with unknown role(s): ${JSON.stringify(allowedRoles)}`);
  }

  return (req, res, next) => {
    if (!req.user) {
      return next(createError(401, 'Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      logger.security('Unauthorized access attempt', {
        email: req.user.email,
        userRole: req.user.role,
        requiredRoles: roles,
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
      });

      return next(createError(403, 'Insufficient permissions'));
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize,
  verifyAccessToken,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHMS,
};
