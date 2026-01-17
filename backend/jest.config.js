module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/src/**/*.test.js',
    '**/src/**/*.spec.js'
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/logs/'
  ],

  // Allow transformation of ES modules in MongoDB packages
  transformIgnorePatterns: [
    '/node_modules/(?!(mongodb|mongodb-memory-server|mongodb-memory-server-core|@mongodb-js|bson)/)',
  ],

  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/server.js',
    '!src/seed/**',
    '!src/migrations/**',
    '!**/node_modules/**'
  ],

  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'clover'
  ],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Transform files
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest'
  },

  // Global variables
  globals: {
    NODE_ENV: 'test'
  },

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect handles that prevent Jest from exiting
  detectOpenHandles: true,

  // Maximum number of concurrent workers
  maxWorkers: 1,

  // Test name pattern for integration tests
  testNamePattern: process.env.TEST_TYPE === 'integration' ? 'integration' : undefined
};
