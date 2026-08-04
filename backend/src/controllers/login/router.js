const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const createError = require('http-errors');

const User = require('../../models/user');
const { validate } = require('../../middleware/validation');
const { loginSchema, refreshSchema } = require('../../validation/schemas');
const { JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHMS } = require('../../models/auth/authenticate');
const { catchAsync } = require('../../middleware/errorHandler');
const logger = require('../../logger/logger');

const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// A bcrypt hash of a value nobody knows. Comparing against it when no account
// matches keeps the response time for "unknown email" in the same range as
// "wrong password", which is what actually prevents user enumeration — a fixed
// sleep does not, because the real path's cost is variable.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

/**
 * Read a required secret from the environment.
 *
 * @param {string} name - Environment variable name.
 * @returns {string} The secret.
 * @throws {Error} 500-level http error when unset.
 */
const requireSecret = (name) => {
  const value = process.env[name];
  if (!value) {
    logger.error(`${name} environment variable is not set`);
    throw createError(500, 'Server configuration error');
  }
  return value;
};

/**
 * Mint an access/refresh token pair for an account.
 *
 * The two tokens are signed with different secrets and carry a `typ` claim, so
 * an access token cannot be replayed against the refresh endpoint to renew
 * itself indefinitely, and a refresh token cannot authorise API calls.
 *
 * @param {object} user - User document.
 * @returns {{accessToken: string, refreshToken: string}} Token pair.
 */
const issueTokens = (user) => {
  const accessSecret = requireSecret('JWT_SECRET');
  const refreshSecret = requireSecret('JWT_REFRESH_SECRET');

  const common = { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, algorithm: JWT_ALGORITHMS[0] };

  const accessToken = jwt.sign(
    { typ: 'access', userId: user._id.toString(), email: user.email, role: user.role },
    accessSecret,
    { ...common, expiresIn: ACCESS_TOKEN_TTL }
  );

  const refreshToken = jwt.sign(
    { typ: 'refresh', userId: user._id.toString(), jti: crypto.randomUUID() },
    refreshSecret,
    { ...common, expiresIn: REFRESH_TOKEN_TTL }
  );

  return { accessToken, refreshToken };
};

/**
 * Shape a user document for the login response.
 *
 * @param {object} user - User document.
 * @returns {object} Public projection.
 */
const publicUser = (user) => ({
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastLogin: user.lastLogin,
});

/**
 * Authenticate a user and return a token pair.
 *
 * @route POST /login
 * @access Public
 */
router.post(
  '/',
  validate(loginSchema),
  catchAsync(async (req, res, next) => {
    const { email, password } = req.body;
    const context = { email, ip: req.ip, userAgent: req.get('User-Agent') };

    const user = await User.findOne({ email }).select('+password');

    // Always run a bcrypt comparison, even when no account matched, so the
    // timing of the two failure modes is indistinguishable.
    const passwordMatches = user
      ? await user.verifyPassword(password)
      : await bcrypt.compare(password, DUMMY_HASH);

    if (!user || !passwordMatches) {
      logger.security('Failed login attempt', {
        ...context,
        reason: user ? 'invalid password' : 'unknown account',
      });
      return next(createError(401, 'Invalid credentials'));
    }

    if (!user.isActive) {
      logger.security('Login attempt on a deactivated account', { ...context, userId: user._id });
      return next(createError(403, 'This account has been deactivated'));
    }

    const { accessToken, refreshToken } = issueTokens(user);

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    logger.audit('Successful login', { ...context, userId: user._id, role: user.role });

    res.status(200).json({
      success: true,
      accessToken,
      refreshToken,
      user: publicUser(user),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  })
);

/**
 * Exchange a refresh token for a new token pair.
 *
 * @route POST /login/refresh
 * @access Public (bearer-free; the refresh token is the credential)
 */
router.post(
  '/refresh',
  validate(refreshSchema),
  catchAsync(async (req, res, next) => {
    const refreshSecret = requireSecret('JWT_REFRESH_SECRET');

    let decoded;
    try {
      decoded = jwt.verify(req.body.refreshToken, refreshSecret, {
        algorithms: JWT_ALGORITHMS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch (error) {
      logger.security('Refresh token rejected', { reason: error.message, ip: req.ip });
      return next(createError(401, 'Invalid refresh token'));
    }

    if (decoded.typ !== 'refresh') {
      logger.security('Non-refresh token presented at the refresh endpoint', {
        typ: decoded.typ,
        ip: req.ip,
      });
      return next(createError(401, 'Invalid refresh token'));
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return next(createError(401, 'Account is no longer active'));
    }

    // Rotate: the presented refresh token's replacement is returned, so a
    // stolen token stops working as soon as the legitimate client refreshes.
    const { accessToken, refreshToken } = issueTokens(user);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  })
);

module.exports = router;
