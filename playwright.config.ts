import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:10312', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    { command: 'pnpm build && go run ./cmd/xtools', url: 'http://127.0.0.1:10312/health/ready', reuseExistingServer: false, timeout: 120_000 },
    { command: 'pnpm exec vite --config tests/e2e/vite.config.ts --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173/tests/e2e/fixture.html', reuseExistingServer: false, timeout: 120_000 },
  ],
})
