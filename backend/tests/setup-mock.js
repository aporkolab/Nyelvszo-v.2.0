const mongoose = require('mongoose');

// Global test configuration
global.testTimeout = 30000;

// Mock MongoDB connection
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue({}),
    connection: {
      ...actualMongoose.connection,
      dropDatabase: jest.fn().mockResolvedValue({}),
      close: jest.fn().mockResolvedValue({}),
      collections: {}
    }
  };
});

// Setup before all tests
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests
  process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
});

// Cleanup after each test
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Cleanup after all tests
afterAll(async () => {
  // Nothing to cleanup with mocked connection
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Mock User model
const mockUser = {
  save: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
  findByIdAndDelete: jest.fn().mockResolvedValue({}),
  deleteMany: jest.fn().mockResolvedValue({}),
};

// Mock Entry model  
const mockEntry = {
  save: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
  findByIdAndDelete: jest.fn().mockResolvedValue({}),
  deleteMany: jest.fn().mockResolvedValue({}),
};

// Global test helpers
global.createTestUser = async (userData = {}) => {
  const defaultUser = {
    _id: 'mock-user-id',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    role: 1,
    password: 'TestPassword123!',
    isActive: true,
    ...userData
  };

  return defaultUser;
};

global.createTestEntry = async (entryData = {}) => {
  const defaultEntry = {
    _id: 'mock-entry-id',
    hungarian: 'teszt szó',
    english: 'test word',
    fieldOfExpertise: 'informatika',
    wordType: 'főnév',
    ...entryData
  };

  return defaultEntry;
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

// Mock models
jest.mock('../src/models/user', () => {
  return jest.fn().mockImplementation((userData) => ({
    ...userData,
    save: jest.fn().mockResolvedValue({ ...userData, _id: 'mock-user-id' })
  }));
});

jest.mock('../src/models/entry', () => {
  return jest.fn().mockImplementation((entryData) => ({
    ...entryData,
    save: jest.fn().mockResolvedValue({ ...entryData, _id: 'mock-entry-id' })
  }));
});
