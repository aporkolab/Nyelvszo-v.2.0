const jwt = require('jsonwebtoken');

const {
  authenticate,
  authorize,
  verifyAccessToken,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHMS,
} = require('../../../src/models/auth/authenticate');
const { ROLES, EDITORIAL_ROLES, ADMIN_ROLES } = require('../../../src/constants/roles');

/**
 * Minimal Express request stand-in.
 *
 * @param {object} [overrides] - Fields to override.
 * @returns {object} Fake request.
 */
const fakeRequest = (overrides = {}) => ({
  headers: {},
  ip: '127.0.0.1',
  method: 'GET',
  originalUrl: '/protected',
  get: () => 'jest',
  ...overrides,
});

/**
 * Await a middleware and return whatever it passed to next().
 *
 * @param {function} middleware - Express middleware.
 * @param {object} req - Fake request.
 * @returns {Promise<Error|undefined>} The error handed to next, if any.
 */
const callMiddleware = async (middleware, req) => {
  let received;
  await middleware(req, {}, (err) => {
    received = err;
  });
  return received;
};

describe('authenticate middleware', () => {
  test('should pin the algorithm list to HS256 only', () => {
    // An empty or permissive list lets a token with `alg: none` verify.
    expect(JWT_ALGORITHMS).toEqual(['HS256']);
    expect(JWT_ISSUER).toBe('nyelvszo-api');
    expect(JWT_AUDIENCE).toBe('nyelvszo-client');
  });

  test('should require a Bearer prefix', async () => {
    const error = await callMiddleware(authenticate, fakeRequest());

    expect(error.status).toBe(401);
    expect(error.message).toBe('Access token is required');
  });

  test('should reject a Bearer prefix with nothing after it', async () => {
    const error = await callMiddleware(
      authenticate,
      fakeRequest({ headers: { authorization: 'Bearer ' } })
    );

    expect(error.status).toBe(401);
  });

  test('should reject a non-Bearer scheme carrying a valid token', async () => {
    const token = jwt.sign({ typ: 'access', userId: 'x' }, process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const error = await callMiddleware(
      authenticate,
      fakeRequest({ headers: { authorization: `Basic ${token}` } })
    );

    expect(error.status).toBe(401);
    expect(error.message).toBe('Access token is required');
  });

  test('should fail closed when JWT_SECRET is unset', async () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const error = await callMiddleware(
        authenticate,
        fakeRequest({ headers: { authorization: 'Bearer whatever' } })
      );

      expect(error.status).toBe(500);
      expect(error.message).toBe('Server configuration error');
    } finally {
      process.env.JWT_SECRET = previous;
    }
  });

  test('should translate each jsonwebtoken failure into a 401', async () => {
    const cases = [
      ['garbage', 'Invalid token'],
      [
        jwt.sign({ typ: 'access' }, process.env.JWT_SECRET, {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: '-1s',
        }),
        'Token has expired',
      ],
      [
        jwt.sign({ typ: 'access' }, process.env.JWT_SECRET, {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          notBefore: '1h',
        }),
        'Token not active',
      ],
    ];

    for (const [token, message] of cases) {
      const error = await callMiddleware(
        authenticate,
        fakeRequest({ headers: { authorization: `Bearer ${token}` } })
      );

      expect(error.status).toBe(401);
      expect(error.message).toBe(message);
    }
  });
});

describe('verifyAccessToken', () => {
  const sign = (payload, options = {}) =>
    jwt.sign(payload, process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: '15m',
      ...options,
    });

  test('should return the claims of a well-formed token', () => {
    const decoded = verifyAccessToken(sign({ typ: 'access', role: 3 }), process.env.JWT_SECRET);

    expect(decoded.typ).toBe('access');
    expect(decoded.role).toBe(3);
    expect(decoded.iss).toBe(JWT_ISSUER);
    expect(decoded.aud).toBe(JWT_AUDIENCE);
  });

  test('should refuse a foreign issuer', () => {
    expect(() =>
      verifyAccessToken(sign({ typ: 'access' }, { issuer: 'elsewhere' }), process.env.JWT_SECRET)
    ).toThrow(/issuer/i);
  });

  test('should refuse a foreign audience', () => {
    expect(() =>
      verifyAccessToken(sign({ typ: 'access' }, { audience: 'elsewhere' }), process.env.JWT_SECRET)
    ).toThrow(/audience/i);
  });

  test('should refuse the wrong secret', () => {
    expect(() =>
      verifyAccessToken(sign({ typ: 'access' }), 'a-different-secret-of-adequate-length')
    ).toThrow(/signature/i);
  });
});

describe('authorize middleware', () => {
  test('should reject an unknown role at wiring time', () => {
    // Thrown while the router is being built, so a typo cannot silently create
    // a route nobody can reach — or worse, one everybody can.
    expect(() => authorize(99)).toThrow(TypeError);
    expect(() => authorize([1, 99])).toThrow(TypeError);
    expect(() => authorize([])).toThrow(TypeError);
    expect(() => authorize('admin')).toThrow(TypeError);
  });

  test('should accept a bare role as well as an array', async () => {
    const single = authorize(ROLES.ADMIN);

    expect(await callMiddleware(single, { user: { role: ROLES.ADMIN } })).toBeUndefined();
    expect((await callMiddleware(single, { user: { role: ROLES.EDITOR } })).status).toBe(403);
  });

  test('should demand authentication first', async () => {
    const error = await callMiddleware(authorize(ADMIN_ROLES), fakeRequest());

    expect(error.status).toBe(401);
    expect(error.message).toBe('Authentication required');
  });

  test('should match membership exactly, not "at least"', async () => {
    // EDITORIAL_ROLES is [2, 3]; a hypothetical role 4 must not slip through on
    // a numeric comparison.
    const middleware = authorize(EDITORIAL_ROLES);

    expect(
      await callMiddleware(middleware, fakeRequest({ user: { role: ROLES.EDITOR } }))
    ).toBeUndefined();
    expect(
      await callMiddleware(middleware, fakeRequest({ user: { role: ROLES.ADMIN } }))
    ).toBeUndefined();

    const denied = await callMiddleware(middleware, fakeRequest({ user: { role: ROLES.VIEWER } }));
    expect(denied.status).toBe(403);
    expect(denied.message).toBe('Insufficient permissions');
  });

  test('should deny a role of the wrong type', async () => {
    const middleware = authorize(ADMIN_ROLES);

    for (const role of ['3', null, undefined, true]) {
      const error = await callMiddleware(middleware, fakeRequest({ user: { role } }));
      expect(error.status).toBe(403);
    }
  });
});
