import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// 127.0.0.1 rather than localhost, so Windows can't pick ::1 for one side and IPv4 for the other.
const BASE_URL = `http://127.0.0.1:${PORT}`
const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  // e2e/fixtures/*.test.ts belong to Vitest; the performance suite has its own config.
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Headless WebGL runs on SwiftShader, which leans on the CPU.
  workers: CI ? 1 : 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'on-first-retry' : 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // The camera jumps instead of gliding, so views settle at once.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    // The default headless shell renders WebGL 2 with SwiftShader, the same on every machine.
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // Always the production build, served as it would be. Type checking stays with
    // npm run typecheck, so a half-written spec can't stop the server starting.
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
})
