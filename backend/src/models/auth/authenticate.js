const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const logger = require('../../logger/logger');

/**
 * JWT Authentication middleware
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const authenticate = (req, res, next) => {
	const authHeader = req.headers.authorization;
	const token = authHeader && authHeader.startsWith('Bearer ') 
		? authHeader.slice(7) // Remove 'Bearer ' prefix
		: null;

	if (!token) {
		return next(createError(401, 'Access token is required'));
	}

	try {
		const jwtSecret = process.env.JWT_SECRET;
		if (!jwtSecret) {
			logger.error('JWT_SECRET environment variable is not set');
			return next(createError(500, 'Server configuration error'));
		}

		const decoded = jwt.verify(token, jwtSecret);
		
		// Check token expiration (additional safety check)
		if (decoded.exp && Date.now() >= decoded.exp * 1000) {
			return next(createError(401, 'Token has expired'));
		}

		// Attach user info to request object
		req.user = {
			email: decoded.email,
			role: decoded.role,
			iat: decoded.iat,
			exp: decoded.exp
		};
		
		next();
	} catch (error) {
		logger.warn(`JWT verification failed: ${error.message}`, {
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			timestamp: new Date().toISOString()
		});
		
		if (error.name === 'JsonWebTokenError') {
			return next(createError(401, 'Invalid token'));
		} else if (error.name === 'TokenExpiredError') {
			return next(createError(401, 'Token has expired'));
		} else if (error.name === 'NotBeforeError') {
			return next(createError(401, 'Token not active'));
		}
		
		return next(createError(401, 'Authentication failed'));
	}
};

/**
 * Role-based authorization middleware factory
 * @param {number|array} allowedRoles - Role(s) that are allowed to access the resource
 * @returns {function} Express middleware function
 */
const authorize = (allowedRoles) => {
	return (req, res, next) => {
		if (!req.user) {
			return next(createError(401, 'Authentication required'));
		}

		const userRole = req.user.role;
		const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

		if (!roles.includes(userRole)) {
			logger.warn(`Unauthorized access attempt`, {
				email: req.user.email,
				userRole: userRole,
				requiredRoles: roles,
				endpoint: req.path,
				method: req.method,
				ip: req.ip
			});
			
			return next(createError(403, 'Insufficient permissions'));
		}

		next();
	};
};

module.exports = {
	authenticate,
	authorize
};
