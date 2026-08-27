/// <reference types="node" />

import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env.local')) {
  loadEnvFile('.env.local');
}

const demoPort = Number(process.env.BINDERLEDGER_DEMO_MEDIA_PORT ?? 8084);
const baseURL =
  process.env.BINDERLEDGER_DEMO_MEDIA_BASE_URL ?? `http://127.0.0.1:${demoPort}`;
const skipServer = parseBoolean(process.env.BINDERLEDGER_DEMO_MEDIA_SKIP_SERVER);
const reuseServer = parseBoolean(process.env.BINDERLEDGER_DEMO_MEDIA_REUSE_SERVER);
const apiURL =
  process.env.BINDERLEDGER_DEMO_MEDIA_API_URL ?? process.env.EXPO_PUBLIC_API_URL;
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

if (!skipServer) {
  if (!apiURL) {
    throw new Error(
      'Set EXPO_PUBLIC_API_URL in .env.local or BINDERLEDGER_DEMO_MEDIA_API_URL before capturing media.',
    );
  }
  webServerEnv.BINDERLEDGER_DEMO_MEDIA_API_URL = apiURL;
  webServerEnv.EXPO_PUBLIC_API_URL = '';
  webServerEnv.BINDERLEDGER_DEMO_MEDIA_PORT = String(demoPort);
}

export default defineConfig({
  expect: { timeout: 20_000 },
  fullyParallel: false,
  outputDir: '.artifacts/playwright/demo-media',
  reporter: [['list']],
  testDir: './e2e',
  testMatch: 'demo-media.capture.ts',
  timeout: Number(process.env.BINDERLEDGER_DEMO_MEDIA_TEST_TIMEOUT_MS ?? 240_000),
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: skipServer
    ? undefined
    : {
        command:
          'node node_modules/expo/bin/cli export --platform web --clear ' +
          '&& node e2e/demo-media-server.mjs',
        env: webServerEnv,
        reuseExistingServer: reuseServer,
        timeout: Number(process.env.BINDERLEDGER_DEMO_MEDIA_SERVER_TIMEOUT_MS ?? 180_000),
        url: baseURL,
      },
  workers: 1,
});

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}
