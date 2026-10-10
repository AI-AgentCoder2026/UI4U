import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke tests run against the demo pages through the dev server.
 *
 * Specs live in `e2e/` rather than `test/` on purpose: `node --test` discovers
 * every file under a directory named `test`, which would drag Playwright specs
 * into the unit-test run.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'node scripts/dev.mjs',
    url: 'http://localhost:5173/demo/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});