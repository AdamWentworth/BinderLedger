import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
  reporter: process.env.CI ? 'line' : 'list',
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8083',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx expo serve dist --port 8083',
    reuseExistingServer: !process.env.CI,
    stderr: 'pipe',
    stdout: 'ignore',
    timeout: 120_000,
    url: 'http://127.0.0.1:8083',
  },
  workers: 1,
});
