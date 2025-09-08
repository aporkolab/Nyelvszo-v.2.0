const createError = require('http-errors');

/**
 * Validation middleware factory
 * @param {object} schema - Joi validation schema
 * @param {string} source - Source of data to validate ('body', 'params', 'query')
 * @returns {function} Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = req[source];
    
    if (!data) {
      return next(createError(400, `No ${source} data provided`));
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false, // Include all errors
      allowUnknown: false, // Disallow unknown fields
      stripUnknown: true, // Remove unknown fields
      convert: true // Convert strings to numbers where possible
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return next(createError(400, 'Validation Error', {
        details: errorMessages,
        type: 'ValidationError'
      }));
    }

    // Replace the original data with validated data
    req[source] = value;
    next();
  };
};

/**
 * Sanitize string inputs to prevent XSS and other attacks
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/[<>]/g, '') // Remove < and > characters
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

/**
 * Sanitize object recursively
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized object
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
};

/**
 * Sanitization middleware
 * @param {string} source - Source of data to sanitize ('body', 'params', 'query')
 * @returns {function} Express middleware function
 */
const sanitize = (source = 'body') => {
  return (req, res, next) => {
    if (req[source]) {
      req[source] = sanitizeObject(req[source]);
    }
    next();
  };
};

module.exports = {
  validate,
  sanitize,
  sanitizeString,
  sanitizeObject
};
