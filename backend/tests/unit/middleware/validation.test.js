const Joi = require('joi');

const { validate } = require('../../../src/middleware/validation');

/**
 * Run a validate() middleware and capture what it produced.
 *
 * @param {object} schema - Joi schema.
 * @param {'body'|'params'|'query'} source - Request part to validate.
 * @param {object} req - Fake request.
 * @returns {{req: object, error: Error|undefined, nextCalls: number}} Outcome.
 */
const run = (schema, source, req) => {
  let error;
  let nextCalls = 0;

  validate(schema, source)(req, {}, (err) => {
    nextCalls += 1;
    error = err;
  });

  return { req, error, nextCalls };
};

describe('validate middleware', () => {
  describe('body', () => {
    const schema = Joi.object({
      name: Joi.string().trim().required(),
      age: Joi.number().integer().min(0),
      active: Joi.boolean().default(true),
    });

    test('should default to the body when no source is given', () => {
      const req = { body: { name: 'Ada' } };
      let error;

      validate(schema)(req, {}, (err) => {
        error = err;
      });

      expect(error).toBeUndefined();
      expect(req.body).toEqual({ name: 'Ada', active: true });
    });

    test('should strip unknown keys rather than reject them', () => {
      const { req, error } = run(schema, 'body', {
        body: { name: 'Ada', role: 3, isAdmin: true, _id: 'abc' },
      });

      expect(error).toBeUndefined();
      expect(req.body).toEqual({ name: 'Ada', active: true });
      expect(req.body).not.toHaveProperty('role');
      expect(req.body).not.toHaveProperty('isAdmin');
      expect(req.body).not.toHaveProperty('_id');
    });

    test('should coerce types', () => {
      const { req } = run(schema, 'body', {
        body: { name: '  Ada  ', age: '42', active: 'false' },
      });

      expect(req.body).toEqual({ name: 'Ada', age: 42, active: false });
      expect(typeof req.body.age).toBe('number');
      expect(typeof req.body.active).toBe('boolean');
    });

    test('should apply defaults for absent keys', () => {
      const { req } = run(schema, 'body', { body: { name: 'Ada' } });

      expect(req.body.active).toBe(true);
    });

    test('should replace the raw input so handlers never see it', () => {
      const raw = { name: 'Ada', injected: { $ne: null } };
      const { req } = run(schema, 'body', { body: raw });

      expect(req.body).not.toBe(raw);
      expect(req.body).not.toHaveProperty('injected');
    });

    test('should reject an operator object where a scalar is expected', () => {
      const { error } = run(schema, 'body', { body: { name: { $ne: null } } });

      expect(error.status).toBe(400);
      expect(error.details[0].field).toBe('name');
    });

    test('should report every failure at once, not just the first', () => {
      const { error } = run(schema, 'body', { body: { age: -5 } });

      expect(error.status).toBe(400);
      expect(error.message).toBe('Validation Error');
      expect(error.type).toBe('ValidationError');
      expect(error.details.map((d) => d.field).sort()).toEqual(['age', 'name']);
    });

    test('should call next exactly once on success and on failure', () => {
      expect(run(schema, 'body', { body: { name: 'Ada' } }).nextCalls).toBe(1);
      expect(run(schema, 'body', { body: {} }).nextCalls).toBe(1);
    });

    test('should treat an absent body as an empty object', () => {
      const { error } = run(schema, 'body', {});

      expect(error.status).toBe(400);
      expect(error.details[0].field).toBe('name');
    });

    test('should join a nested path into a dotted field name', () => {
      const nested = Joi.object({ filters: Joi.object({ kind: Joi.string() }) });

      const { error } = run(nested, 'body', { body: { filters: { kind: 42 } } });

      expect(error.details[0].field).toBe('filters.kind');
    });
  });

  describe('query', () => {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().trim().allow(''),
    });

    test('should publish the validated value on req.validatedQuery', () => {
      // Express 5 makes req.query a getter, so validatedQuery is the accessor
      // handlers are expected to read.
      const req = { query: { page: '3' } };
      const { error } = run(schema, 'query', req);

      expect(error).toBeUndefined();
      expect(req.validatedQuery).toEqual({ page: 3, limit: 20 });
      expect(typeof req.validatedQuery.page).toBe('number');
    });

    test('should also assign req.query where the framework allows it', () => {
      const req = { query: { page: '3' } };
      run(schema, 'query', req);

      // Express 4 permits the assignment; the middleware must keep both in sync
      // so handlers written against either accessor agree.
      expect(req.query).toEqual(req.validatedQuery);
    });

    test('should not throw when req.query is read-only', () => {
      const req = {};
      Object.defineProperty(req, 'query', {
        get: () => ({ page: '2' }),
        configurable: true,
      });

      let error;
      expect(() => {
        validate(schema, 'query')(req, {}, (err) => {
          error = err;
        });
      }).not.toThrow();

      expect(error).toBeUndefined();
      expect(req.validatedQuery).toEqual({ page: 2, limit: 20 });
    });

    test('should strip unknown query parameters', () => {
      const req = { query: { page: '1', sort: '-password', select: 'password' } };
      run(schema, 'query', req);

      expect(req.validatedQuery).toEqual({ page: 1, limit: 20 });
    });

    test('should reject a bracket-notation operator', () => {
      // `?search[$ne]=` arrives from qs as a nested object; declaring the key as
      // a string is what stops it reaching the Mongoose filter.
      const { error } = run(schema, 'query', { query: { search: { $ne: '' } } });

      expect(error.status).toBe(400);
      expect(error.details[0].field).toBe('search');
    });

    test('should reject a page size above the cap rather than clamping it', () => {
      const { error } = run(schema, 'query', { query: { limit: '100000' } });

      expect(error.status).toBe(400);
      expect(error.details[0].field).toBe('limit');
    });

    test('should apply defaults to a completely empty query', () => {
      const req = { query: {} };
      run(schema, 'query', req);

      expect(req.validatedQuery).toEqual({ page: 1, limit: 20 });
    });
  });

  describe('params', () => {
    const schema = Joi.object({
      id: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    });

    test('should accept a well-formed id', () => {
      const req = { params: { id: '507f1f77bcf86cd799439011' } };
      const { error } = run(schema, 'params', req);

      expect(error).toBeUndefined();
      expect(req.params.id).toBe('507f1f77bcf86cd799439011');
    });

    test('should reject a malformed id with a 400, not let it reach the driver', () => {
      const { error } = run(schema, 'params', { params: { id: 'not-an-id' } });

      expect(error.status).toBe(400);
      expect(error.details[0].field).toBe('id');
    });
  });
});
