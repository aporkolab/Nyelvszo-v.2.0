const createError = require('http-errors');

/**
 * Validation middleware factory.
 *
 * On success the validated (coerced, defaulted, unknown-stripped) value
 * replaces the raw input, so handlers downstream never see the original.
 *
 * Note on `query`: Express 5 makes `req.query` a getter, so it cannot be
 * reassigned. The validated value is therefore also exposed on
 * `req.validatedQuery`, and handlers should prefer that.
 *
 * @param {object} schema - Joi schema.
 * @param {'body'|'params'|'query'} [source] - Which part of the request to validate.
 * @returns {function} Express middleware.
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = req[source] ?? {};

    // The simple query parser preserves bracket notation in parameter names.
    // Reject MongoDB operator syntax before Joi strips unknown parameters.
    if (source === 'query' && Object.keys(data).some((key) => /\$|\[|\]/.test(key))) {
      return next(createError(400, 'Validation Error', { type: 'ValidationError' }));
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return next(createError(400, 'Validation Error', { details, type: 'ValidationError' }));
    }

    if (source === 'query') {
      req.validatedQuery = value;
      // Express 4 allows the assignment; Express 5 does not. Try, and fall back
      // to `req.validatedQuery` alone rather than throwing.
      try {
        req.query = value;
      } catch {
        /* read-only in Express 5 — validatedQuery is the supported accessor */
      }
    } else {
      req[source] = value;
    }

    next();
  };
};

module.exports = {
  validate,
};
