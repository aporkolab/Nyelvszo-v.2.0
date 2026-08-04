const createError = require('http-errors');

const {
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
} = require('../../../src/middleware/errorHandler');

/**
 * Minimal Express request stand-in.
 *
 * @param {object} [overrides] - Fields to override.
 * @returns {object} Fake request.
 */
const fakeRequest = (overrides = {}) => ({
  originalUrl: '/some/path',
  method: 'POST',
  ip: '127.0.0.1',
  body: {},
  get: () => 'jest',
  ...overrides,
});

/**
 * Minimal Express response stand-in that records what was sent.
 *
 * @returns {object} Fake response exposing `statusCode` and `body`.
 */
const fakeResponse = () => {
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

/**
 * Run the error handler and return the captured response.
 *
 * @param {Error} error - Error to handle.
 * @param {object} [req] - Request override.
 * @returns {object} Fake response after handling.
 */
const handle = (error, req = fakeRequest()) => {
  const res = fakeResponse();
  errorHandler(error, req, res, () => {});
  return res;
};

describe('errorHandler middleware', () => {
  describe('redact', () => {
    test('should replace top-level secrets', () => {
      expect(redact({ email: 'a@b.c', password: 'hunter2' })).toEqual({
        email: 'a@b.c',
        password: '[REDACTED]',
      });
    });

    test('should replace secrets nested several levels deep', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              password: 'hunter2',
              keep: 'visible',
            },
          },
        },
      };

      const output = redact(input);

      expect(output.level1.level2.level3.password).toBe('[REDACTED]');
      expect(output.level1.level2.level3.keep).toBe('visible');
    });

    test('should match field names case-insensitively', () => {
      const output = redact({
        Password: 'a',
        NewPassword: 'b',
        currentPassword: 'c',
        passwordConfirm: 'd',
        Token: 'e',
        accessToken: 'f',
        refreshToken: 'g',
        Authorization: 'h',
        SECRET: 'i',
        apiKey: 'j',
      });

      Object.values(output).forEach((value) => expect(value).toBe('[REDACTED]'));
    });

    test('should redact inside arrays', () => {
      const output = redact({ users: [{ email: 'a@b.c', password: 'hunter2' }] });

      expect(output.users[0].password).toBe('[REDACTED]');
      expect(output.users[0].email).toBe('a@b.c');
    });

    test('should cap array length so a huge body cannot fill the log', () => {
      const output = redact(Array.from({ length: 500 }, (_, i) => i));

      expect(output).toHaveLength(50);
    });

    test('should stop recursing past the depth limit', () => {
      // Six levels down the value is returned untouched rather than walked
      // forever — a cycle or a pathological payload must not hang the logger.
      let deep = { password: 'hunter2' };
      for (let i = 0; i < 10; i += 1) {
        deep = { nested: deep };
      }

      expect(() => redact(deep)).not.toThrow();
    });

    test('should survive a circular structure', () => {
      const node = { password: 'hunter2' };
      node.self = node;

      expect(() => redact(node)).not.toThrow();
      expect(redact(node).password).toBe('[REDACTED]');
    });

    test('should pass primitives and null through unchanged', () => {
      expect(redact(null)).toBeNull();
      expect(redact(undefined)).toBeUndefined();
      expect(redact('plain')).toBe('plain');
      expect(redact(42)).toBe(42);
    });
  });

  describe('AppError', () => {
    test('should carry status, type and the operational flag', () => {
      const error = new AppError('boom', 418, 'TeapotError');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.message).toBe('boom');
      expect(error.statusCode).toBe(418);
      expect(error.type).toBe('TeapotError');
      expect(error.isOperational).toBe(true);
      expect(error.stack).toBeDefined();
    });

    test('should default to a 500 ApplicationError', () => {
      const error = new AppError('boom');

      expect(error.statusCode).toBe(500);
      expect(error.type).toBe('ApplicationError');
    });

    test('should carry details through to the response', () => {
      const details = [{ field: 'email', message: 'Email is required' }];
      const error = new AppError('Validation failed', 400, 'ValidationError', { details });

      expect(error.details).toEqual(details);

      const res = handle(error);

      expect(res.statusCode).toBe(400);
      expect(res.body.details).toEqual(details);
      expect(res.body.type).toBe('ValidationError');
    });

    test('should omit the details key entirely when there are none', () => {
      const res = handle(new AppError('boom', 400));

      expect(res.body).not.toHaveProperty('details');
    });
  });

  describe('production behaviour', () => {
    let previousEnv;

    beforeEach(() => {
      previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = previousEnv;
    });

    test('should keep an http-errors 401 a 401', () => {
      // http-errors instances carry `expose: true` but no `isOperational`
      // flag. Treating only `isOperational` as trustworthy turned every 401
      // and 404 into a 500 for production clients.
      const res = handle(createError(401, 'Access token is required'));

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Access token is required');
      expect(res.body.statusCode).toBe(401);
    });

    test('should keep every http-errors 4xx status', () => {
      [400, 403, 404, 409, 413, 429].forEach((status) => {
        const res = handle(createError(status, `status ${status}`));

        expect(res.statusCode).toBe(status);
        expect(res.body.error).toBe(`status ${status}`);
      });
    });

    test('should keep an operational AppError 4xx', () => {
      const res = handle(createNotFoundError('Entry'));

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Entry not found');
    });

    test('should not leak the message or stack of an unexpected failure', () => {
      const res = handle(new TypeError('secretTable.column does not exist'));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Something went wrong');
      expect(res.body.type).toBe('InternalServerError');
      expect(res.body).not.toHaveProperty('stack');
      expect(JSON.stringify(res.body)).not.toContain('secretTable');
    });

    test('should not attach a stack to a client-safe response either', () => {
      const res = handle(createError(404, 'Nope'));

      expect(res.body).not.toHaveProperty('stack');
    });

    test('should collapse a 5xx http-error into an opaque 500', () => {
      // http-errors does not set `expose` on 5xx, so the message is treated as
      // internal — the client learns nothing about the upstream failure.
      const res = handle(createError(503, 'Upstream mongo at 10.0.0.4 is down'));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Something went wrong');
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.4');
    });
  });

  describe('development and test behaviour', () => {
    test('should include the stack for debugging', () => {
      const res = handle(new AppError('boom', 400));

      expect(res.body.stack).toEqual(expect.any(String));
    });

    test('should surface the real message of an unexpected failure', () => {
      const res = handle(new TypeError('cannot read property x of undefined'));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('cannot read property x of undefined');
      expect(res.body.stack).toEqual(expect.any(String));
    });
  });

  describe('database and JWT error translation', () => {
    test('should turn a CastError into a 400', () => {
      const castError = Object.assign(new Error('Cast to ObjectId failed'), {
        name: 'CastError',
        path: '_id',
      });

      const res = handle(castError);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid value for _id');
      expect(res.body.type).toBe('ValidationError');
    });

    test('should turn a duplicate-key error into a 409', () => {
      const duplicate = Object.assign(new Error('E11000'), {
        code: 11000,
        keyValue: { email: 'taken@example.com' },
      });

      const res = handle(duplicate);

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('Duplicate value for email');
      expect(res.body.type).toBe('DuplicateError');
    });

    test('should name the field generically when the driver omits keyValue', () => {
      const res = handle(Object.assign(new Error('E11000'), { code: 11000 }));

      expect(res.body.error).toBe('Duplicate value for field');
    });

    test('should flatten a Mongoose ValidationError into details', () => {
      const validationError = Object.assign(new Error('validation failed'), {
        name: 'ValidationError',
        errors: {
          hungarian: { path: 'hungarian', message: 'Path `hungarian` is required.' },
          english: { path: 'english', message: 'Path `english` is required.' },
        },
      });

      const res = handle(validationError);

      expect(res.statusCode).toBe(400);
      expect(res.body.details).toEqual([
        { field: 'hungarian', message: 'Path `hungarian` is required.' },
        { field: 'english', message: 'Path `english` is required.' },
      ]);
    });

    test('should turn JWT errors into 401s', () => {
      const cases = [
        ['JsonWebTokenError', 'Invalid token. Please log in again.'],
        ['TokenExpiredError', 'Your token has expired. Please log in again.'],
        ['NotBeforeError', 'Token not active. Please log in again.'],
      ];

      cases.forEach(([name, message]) => {
        const res = handle(Object.assign(new Error('raw'), { name }));

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe(message);
        expect(res.body.type).toBe('AuthenticationError');
      });
    });
  });

  describe('logging', () => {
    const logger = require('../../../src/logger/logger');

    test('should redact the request body before logging it', () => {
      handle(
        new AppError('boom', 400),
        fakeRequest({ body: { email: 'a@b.c', password: 'hunter2', refreshToken: 'abc' } })
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'boom',
        expect.objectContaining({
          requestBody: { email: 'a@b.c', password: '[REDACTED]', refreshToken: '[REDACTED]' },
        })
      );
    });

    test('should log a 5xx with the error object and a 4xx with the message', () => {
      // tests/setup.js points every logger method at one shared jest.fn, so the
      // distinction is asserted through the arguments rather than which method
      // was called.
      const serverSide = new AppError('server side', 500);
      handle(serverSide);

      expect(logger.logError.mock.calls.at(-1)[0]).toBe(serverSide);
      expect(logger.logError.mock.calls.at(-1)[1]).toMatchObject({ statusCode: 500 });

      handle(new AppError('client side', 400));

      expect(logger.warn.mock.calls.at(-1)[0]).toBe('client side');
      expect(logger.warn.mock.calls.at(-1)[1]).toMatchObject({ statusCode: 400 });
    });

    test('should include the authenticated user when there is one', () => {
      handle(
        new AppError('boom', 400),
        fakeRequest({ user: { userId: 'abc123', email: 'admin@example.com' } })
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'boom',
        expect.objectContaining({ userId: 'abc123', userEmail: 'admin@example.com' })
      );
    });

    test('should omit the body key when the body is empty', () => {
      handle(new AppError('boom', 400), fakeRequest({ body: {} }));

      const [, context] = logger.warn.mock.calls.at(-1);
      expect(context).not.toHaveProperty('requestBody');
    });
  });

  describe('notFoundHandler', () => {
    test('should hand a 404 to next', () => {
      const next = jest.fn();

      notFoundHandler(fakeRequest({ method: 'GET', originalUrl: '/nope' }), {}, next);

      const error = next.mock.calls[0][0];

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.type).toBe('NotFoundError');
      expect(error.message).toBe('Cannot GET /nope');
    });
  });

  describe('catchAsync', () => {
    test('should forward a rejection to next', async () => {
      const boom = new Error('async boom');
      const next = jest.fn();

      catchAsync(async () => {
        throw boom;
      })({}, {}, next);

      await Promise.resolve();

      expect(next).toHaveBeenCalledWith(boom);
    });

    test('should forward a synchronous throw to next', async () => {
      const boom = new Error('sync boom');
      const next = jest.fn();

      catchAsync(() => Promise.reject(boom))({}, {}, next);

      await Promise.resolve();

      expect(next).toHaveBeenCalledWith(boom);
    });

    test('should leave a resolving handler alone', async () => {
      const next = jest.fn();
      const handler = jest.fn().mockResolvedValue('ok');

      catchAsync(handler)({ a: 1 }, { b: 2 }, next);

      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith({ a: 1 }, { b: 2 }, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('error factories', () => {
    test('should build each error with the right status and type', () => {
      expect(createValidationError('bad', [{ field: 'a', message: 'b' }])).toMatchObject({
        statusCode: 400,
        type: 'ValidationError',
        details: [{ field: 'a', message: 'b' }],
      });

      expect(createAuthError()).toMatchObject({
        statusCode: 401,
        type: 'AuthenticationError',
        message: 'Authentication required',
      });

      expect(createForbiddenError()).toMatchObject({
        statusCode: 403,
        type: 'ForbiddenError',
        message: 'Access forbidden',
      });

      expect(createNotFoundError()).toMatchObject({
        statusCode: 404,
        type: 'NotFoundError',
        message: 'Resource not found',
      });

      expect(createConflictError('clash')).toMatchObject({
        statusCode: 409,
        type: 'ConflictError',
        message: 'clash',
      });
    });
  });
});
