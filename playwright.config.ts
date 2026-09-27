import { defineConfig, devices } from '@playwright/test'

// `pnpm test:e2e` loads .env, so PORT matches the dev server's port. E2E_BASE_URL targets an already running
// deployment instead.
const port = process.env.PORT ?? '3001'
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [[process.env.CI ? 'github' : 'list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The specs run against the real local API (see README → Testing); only the front is started here.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
