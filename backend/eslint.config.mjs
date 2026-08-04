import js from '@eslint/js';
import globals from 'globals';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'logs/**', 'dist/**'],
  },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // The logger exists so that nothing writes to stdout directly. The two
      // legitimate exceptions (startup failure, crash handlers) carry inline
      // disables, so this can be an error rather than a warning.
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-return-await': 'error',
      // Off deliberately. Every report it produces here is an Express handler
      // assigning to `req` or to a document it just awaited — the normal shape
      // of async middleware, with no second writer to race against. The rule
      // cannot distinguish that from a genuine shared-state race, so leaving it
      // on would mean scattering suppressions rather than finding bugs.
      'require-atomic-updates': 'off',
      'no-promise-executor-return': 'error',
      'no-unsafe-optional-chaining': 'error',
    },
  },

  {
    files: ['tests/**/*.js'],
    ...jest.configs['flat/recommended'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
        // Helpers defined in tests/setup.js.
        createTestUser: 'readonly',
        createTestEntry: 'readonly',
        signAccessToken: 'readonly',
        authHeader: 'readonly',
      },
    },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      'no-console': 'off',
      // A test that asserts nothing passes silently and hides a regression.
      // supertest's fluent `.expect(status)` is an assertion too, but the rule
      // only recognises bare `expect()` unless told otherwise.
      'jest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', '**.expect', 'request.**.expect'] },
      ],
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
    },
  },

  // Must stay last: turns off every stylistic rule Prettier already owns.
  prettier,
];
