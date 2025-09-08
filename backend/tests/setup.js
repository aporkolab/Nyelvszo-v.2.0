const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Global test configuration
global.testTimeout = 30000;

let mongod;

// Setup before all tests
beforeAll(async () => {
  // Create in-memory MongoDB instance
  mongod = await MongoMemoryServer.create({
    instance: {
      port: 0, // Use random port
      dbName: 'test_db'
    }
  });

  const uri = mongod.getUri();
  
  // Connect to in-memory database
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000
  });

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests
});

// Cleanup after each test
afterEach(async () => {
  // Clean up all collections
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close mongoose connection
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();

  // Stop MongoDB instance
  if (mongod) {
    await mongod.stop();
  }
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// Global test helpers
global.createTestUser = async (userData = {}) => {
  const User = require('../src/models/user');
  
  const defaultUser = {
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    role: 1,
    password: 'TestPassword123!',
    isActive: true,
    ...userData
  };

  const user = new User(defaultUser);
  await user.save();
  return user;
};

global.createTestEntry = async (entryData = {}) => {
  const Entry = require('../src/models/entry');
  
  const defaultEntry = {
    hungarian: 'teszt szó',
    english: 'test word',
    fieldOfExpertise: 'informatika',
    wordType: 'főnév',
    ...entryData
  };

  const entry = new Entry(defaultEntry);
  await entry.save();
  return entry;
};

// Mock logger to reduce test output noise
jest.mock('../src/logger/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  stream: {
    write: jest.fn()
  }
}));
