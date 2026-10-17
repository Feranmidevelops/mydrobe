import { expect, test as base } from '@playwright/test'

/** Console noise that isn't the app's fault. Only add to this with a reason. */
const IGNORED = [/GL Driver Message/, /GPU stall due to ReadPixels/]

/**
 * Playwright's test, plus a guard that fails any test whose page throws or logs
 * an error. Tests that provoke errors on purpose opt out with `allowPageErrors`,
 * or list the expected messages in `ignoredConsole`.
 */
export const test = base.extend<{ allowPageErrors: boolean; ignoredConsole: RegExp[]; pageErrors: string[] }>({
  allowPageErrors: [false, { option: true }],
  ignoredConsole: [[], { option: true }],
  pageErrors: [
    async ({ page, allowPageErrors, ignoredConsole }, use) => {
      const errors: string[] = []
      const ignored = [...IGNORED, ...ignoredConsole]
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' && !ignored.some((pattern) => pattern.test(message.text()))) {
          errors.push(`console: ${message.text()}`)
        }
      })
      await use(errors)
      if (!allowPageErrors) expect(errors, 'the page logged errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
