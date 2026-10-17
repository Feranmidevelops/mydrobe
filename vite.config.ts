/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The Three.js viewer is a single lazy-loaded chunk (~280 kB gzipped) that
    // only downloads after the app shell is usable.
    chunkSizeWarningLimit: 1100,
  },
  // Only scan the real HTML entries for dependencies, never playwright-report/index.html.
  optimizeDeps: { entries: ['*.html'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Unit and component tests sit next to the code, plus a guard test for the generated
    // e2e photos. Playwright's e2e/**/*.spec.ts run in real browsers, not here.
    include: ['src/**/*.test.{ts,tsx}', 'e2e/fixtures/**/*.test.ts'],
    css: false,
    // Interaction tests can take a few seconds when the machine is busy
    // (dev server, browser and tests all running at once).
    testTimeout: 15_000,
  },
})
