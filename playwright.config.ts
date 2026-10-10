import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: { headless: false },
});
