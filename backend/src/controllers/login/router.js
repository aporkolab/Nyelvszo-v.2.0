const express = require('express');
const router = express.Router();
const User = require('../../models/user');
const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const { validate, sanitize } = require('../../middleware/validation');
const { loginSchema } = require('../../validation/schemas');
const logger = require('../../logger/logger');

/**
 * @route POST /login
 * @desc Authenticate user and return JWT token
 * @access Public
 */
router.post('/', sanitize('body'), validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection?.remoteAddress;
    const userAgent = req.get('User-Agent');

    // Rate limiting is handled by middleware in server.js

    // Find user by email
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      // Log failed login attempt
      logger.warn('Failed login attempt - user not found', {
        email,
        ip: clientIp,
        userAgent,
        timestamp: new Date().toISOString(),
      });

      // Consistent response time to prevent user enumeration
      await new Promise((resolve) => setTimeout(resolve, 100));
      return next(createError(401, 'Invalid credentials'));
    }

    // Verify password
    const isValidPassword = await user.verifyPassword(password);

    if (!isValidPassword) {
      // Log failed login attempt
      logger.warn('Failed login attempt - invalid password', {
        email,
        userId: user._id,
        ip: clientIp,
        userAgent,
        timestamp: new Date().toISOString(),
      });

      return next(createError(401, 'Invalid credentials'));
    }

    // Check if JWT_SECRET is configured
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable is not set');
      return next(createError(500, 'Server configuration error'));
    }

    // Generate JWT token
    const tokenPayload = {
      email: user.email,
      role: user.role,
      userId: user._id.toString(),
    };

    const accessToken = jwt.sign(tokenPayload, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      issuer: 'nyelvszo-api',
      audience: 'nyelvszo-client',
    });

    // Log successful login
    logger.info('Successful login', {
      email: user.email,
      userId: user._id,
      role: user.role,
      ip: clientIp,
      userAgent,
      timestamp: new Date().toISOString(),
    });

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Return success response (exclude password)
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin,
    };

    res.status(200).json({
      success: true,
      accessToken,
      user: userResponse,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });
  } catch (error) {
    logger.error('Login error:', {
      error: error.message,
      stack: error.stack,
      email: req.body?.email,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    next(createError(500, 'Internal server error'));
  }
});

/**
 * @route POST /login/refresh
 * @desc Refresh JWT token
 * @access Private
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(createError(400, 'Refresh token is required'));
    }

    // Verify refresh token logic would go here
    // For now, we'll implement a simple token refresh

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next(createError(500, 'Server configuration error'));
    }

    try {
      const decoded = jwt.verify(refreshToken, jwtSecret);

      // Find user to ensure they still exist and are active
      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(createError(401, 'User not found'));
      }

      // Generate new access token
      const newTokenPayload = {
        email: user.email,
        role: user.role,
        userId: user._id.toString(),
      };

      const newAccessToken = jwt.sign(newTokenPayload, jwtSecret, {
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
        issuer: 'nyelvszo-api',
        audience: 'nyelvszo-client',
      });

      res.json({
        success: true,
        accessToken: newAccessToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      });
    } catch (tokenError) {
      return next(createError(401, 'Invalid refresh token'));
    }
  } catch (error) {
    logger.error('Token refresh error:', error);
    next(createError(500, 'Internal server error'));
  }
});

module.exports = router;
