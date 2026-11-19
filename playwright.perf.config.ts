import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config.ts'

/*
 * The performance suite: npm run test:perf. It measures rather than judges, and
 * writes its numbers to perf-results/ (git-ignored). One worker, so runs never
 * compete for the CPU or GPU. PERF_RUNS sets how often each load repeats
 * (default 5). One project at a time: npm run test:perf -- --project=perf-gpu
 */
export default defineConfig({
  ...base,
  testDir: './e2e/perf',
  testMatch: '**/*.perf.ts',
  outputDir: './test-results/perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  reporter: [['list']],
  // Always a fresh build: a stale preview on 4173 would quietly measure old code (strictPort fails loudly instead).
  webServer: { ...(base.webServer as object), reuseExistingServer: false } as typeof base.webServer,
  use: {
    ...base.use,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    // People see the camera glide, so measure it gliding.
    contextOptions: { reducedMotion: 'no-preference' },
  },
  projects: [
    // Full Chromium in new headless mode draws with the real GPU.
    {
      name: 'perf-gpu',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        launchOptions: { args: ['--enable-precise-memory-info'] },
      },
    },
    // The headless shell draws with SwiftShader on the CPU: the no-GPU worst case.
    {
      name: 'perf-software',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        launchOptions: { args: ['--enable-precise-memory-info'] },
      },
    },
  ],
})
