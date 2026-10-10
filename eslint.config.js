import js from '@eslint/js';
import globals from 'globals';

/**
 * ESLint flat config for UI4U.
 *
 * `src/` is browser code and must stay side-effect free at import time.
 * `test/` runs under node:test but the harness installs DOM globals, so those
 * files legitimately touch `document` and DOM event constructors.
 * `scripts/` is plain node tooling.
 */
export default [
  {
    ignores: [
      'dist/**',
      '.pages/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Replaced at build time by esbuild `define`.
        __UI4U_VERSION__: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Lifecycle overrides document their signature without using every arg.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        // Installed on globalThis by test/helpers/dom.js.
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        // `page.evaluate` callbacks are serialised and run in the browser.
        ...globals.browser,
      },
    },
  },

  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];