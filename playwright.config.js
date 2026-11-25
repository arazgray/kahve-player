import { defineConfig } from '@playwright/test';

const port = 4183;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests',
  timeout: 20_000,
  use: {
    channel: process.env.KAHVE_TEST_BROWSER || 'chrome',
    baseURL,
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    timeout: 60_000,
  },
});
