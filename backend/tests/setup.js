const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Set at module scope, not inside beforeAll: several modules read these at
// require time, and require happens before any hook runs.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Silence the logger. Every method the application actually calls must be
// present — a missing one throws a TypeError inside the code under test, and
// the failure then surfaces somewhere unrelated.
jest.mock('../src/logger/logger', () => {
  const noop = jest.fn();
  return {
    error: noop,
    warn: noop,
    info: noop,
    http: noop,
    verbose: noop,
    debug: noop,
    silly: noop,
    audit: noop,
    security: noop,
    performance: noop,
    database: noop,
    logError: noop,
    logAuth: noop,
    logDatabase: noop,
    stream: { write: noop },
  };
});

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { dbName: 'test_db' } });

  await mongoose.connect(mongod.getUri(), {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });

  // Unique and text indexes are declared on the schemas; build them once so a
  // duplicate email surfaces as a real duplicate-key error rather than saving.
  await Promise.all([
    require('../src/models/user').syncIndexes(),
    require('../src/models/entry').syncIndexes(),
  ]);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  require('../src/middleware/cache').closeCaches();

  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();

  if (mongod) {
    await mongod.stop();
  }
});

/**
 * Persist a user, filling in valid defaults.
 *
 * @param {object} [overrides] - Fields to override.
 * @returns {Promise<object>} Saved user document.
 */
global.createTestUser = async (overrides = {}) => {
  const User = require('../src/models/user');

  const user = new User({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    role: 1,
    password: 'TestPassword123!',
    isActive: true,
    ...overrides,
  });

  await user.save();
  return user;
};

/**
 * Persist a dictionary entry, filling in valid defaults.
 *
 * @param {object} [overrides] - Fields to override.
 * @returns {Promise<object>} Saved entry document.
 */
global.createTestEntry = async (overrides = {}) => {
  const Entry = require('../src/models/entry');

  const entry = new Entry({
    hungarian: 'teszt szó',
    english: 'test word',
    fieldOfExpertise: 'informatika',
    wordType: 'főnév',
    ...overrides,
  });

  await entry.save();
  return entry;
};

/**
 * Mint a signed access token for a user document.
 *
 * Mirrors what the login route issues, including the `typ` claim, issuer and
 * audience — a token missing any of those is rejected by the auth middleware.
 *
 * @param {object} user - User document.
 * @returns {string} Encoded JWT.
 */
global.signAccessToken = (user) => {
  const jwt = require('jsonwebtoken');
  const { JWT_ISSUER, JWT_AUDIENCE } = require('../src/models/auth/authenticate');

  return jwt.sign(
    { typ: 'access', userId: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: '15m' }
  );
};

/**
 * Build an Authorization header value for a user.
 *
 * @param {object} user - User document.
 * @returns {string} "Bearer <token>".
 */
global.authHeader = (user) => `Bearer ${global.signAccessToken(user)}`;
