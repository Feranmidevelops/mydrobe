import { PAGE_CHUNK } from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'

// An aborted request always logs "Failed to load resource". Everything else, an
// unhandled rejection above all, still fails the test.
test.use({ ignoredConsole: [/Failed to load resource: net::ERR_/] })

test('pointing at the way in while offline raises no unhandled errors', async ({ page }) => {
  await page.route(PAGE_CHUNK, (route) => route.abort('internetdisconnected'))
  await page.goto('/')
  const failed = page.waitForEvent('requestfailed', (request) => PAGE_CHUNK.test(request.url()))
  // Hovering starts fetching the fitting room early, so it's usually ready by the click.
  await page.getByRole('link', { name: 'Enter the fitting room' }).first().hover()
  await failed

  // An unhandled rejection would show up as a page error within moments.
  const error = await page.waitForEvent('pageerror', { timeout: 1_000 }).catch(() => null)
  expect(error?.message).toBeUndefined()
})
