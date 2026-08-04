module.exports = {
  testEnvironment: 'node',

  testMatch: ['**/tests/**/*.test.js'],

  testPathIgnorePatterns: ['/node_modules/', '/coverage/', '/logs/'],

  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/seed/**',
    '!src/logger/**',
    '!**/node_modules/**',
  ],

  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'html'],

  // Set just below the suite's current numbers so a regression fails the build.
  // Raise these when coverage improves; never lower them to make CI green.
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 60,
      functions: 75,
      lines: 75,
    },
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // mongodb-memory-server spins up a real mongod; running suites in parallel
  // against one shared instance produces cross-test interference.
  maxWorkers: 1,

  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  verbose: true,
};
