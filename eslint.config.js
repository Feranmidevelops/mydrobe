import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'test-results', 'playwright-report', 'blob-report', 'perf-results']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Node-side code: the Playwright tests, tool configs and scripts. React's hook rules
    // would misread Playwright's `use` fixture callback, so they stay with src.
    files: ['e2e/**/*.ts', '*.config.ts', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      // page.evaluate callbacks run in the page, so DOM globals are fair game too.
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
