import type { Page } from '@playwright/test'
import {
  currentOutfit,
  garmentCard,
  PAGE_CHUNK,
  stageCanvas,
  statusWith,
  storageReady,
  VIEWER_CHUNK,
} from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'

const SLOW_HINT = 'This can take a little longer on a slow connection.'

/**
 * Holds every request matching `pattern` until the returned function is called,
 * so a download takes exactly as long as the test needs. (Not page.clock: it
 * fakes requestAnimationFrame and performance.now, which the 3D view needs.)
 */
async function hold(page: Page, pattern: RegExp) {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route(pattern, async (route) => {
    await released
    await route.continue()
  })
  return release
}

test('while the 3D viewer downloads slowly, the wardrobe and saving already work', async ({ page }) => {
  test.slow()
  const release = await hold(page, VIEWER_CHUNK)
  await page.goto('/fitting-room', { waitUntil: 'domcontentloaded' })
  const loading = statusWith(page, 'Setting up the fitting room…')
  await expect(loading).toBeVisible()
  await expect(loading).not.toContainText(SLOW_HINT)
  await expect(storageReady(page)).toBeVisible()

  // Nothing outside the 3D view waits for its download.
  await garmentCard(page, 'Oxford stripe shirt').click()
  await garmentCard(page, 'Indigo denim').click()
  await expect(garmentCard(page, 'Indigo denim')).toHaveAttribute('aria-pressed', 'true')
  const outfit = currentOutfit(page)
  await outfit.getByRole('button', { name: 'Save outfit' }).click()
  await outfit.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(outfit.getByText('Saved as “Look 1”')).toBeVisible()

  // After six seconds, a word about slow connections.
  await expect(loading).toContainText(SLOW_HINT, { timeout: 10_000 })

  release()
  await expect(stageCanvas(page)).toBeVisible()
  await expect(loading).toHaveCount(0)
})

test('while the fitting room downloads slowly, it says so, then opens', async ({ page }) => {
  test.slow()
  const release = await hold(page, PAGE_CHUNK)
  await page.goto('/fitting-room', { waitUntil: 'domcontentloaded' })
  // Until the page's code arrives there is nothing else on screen to use.
  const loading = statusWith(page, 'Opening the fitting room…')
  await expect(loading).toBeVisible()
  await expect(loading).not.toContainText(SLOW_HINT)
  await expect(loading).toContainText(SLOW_HINT, { timeout: 10_000 })

  release()
  await expect(storageReady(page)).toBeVisible()
  await expect(stageCanvas(page)).toBeVisible()
})

test('on a slow 4G connection the wardrobe and then the 3D view arrive', async ({ page, context }) => {
  test.slow()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  // Chrome DevTools' "Slow 4G": 562.5 ms latency, 180 kB/s down, 84 kB/s up.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 562.5,
    downloadThroughput: 180_000,
    uploadThroughput: 84_375,
  })

  const start = Date.now()
  await page.goto('/fitting-room', { waitUntil: 'commit' })
  await expect(page.getByRole('tab', { name: /^Wardrobe/ })).toBeVisible({ timeout: 30_000 })
  const wardrobeSeconds = (Date.now() - start) / 1000
  await expect(stageCanvas(page)).toBeVisible({ timeout: 60_000 })
  const canvasSeconds = (Date.now() - start) / 1000

  // Measured, not judged: these numbers depend on the machine as much as the app.
  test.info().annotations.push(
    { type: 'slow 4G: wardrobe tab', description: `${wardrobeSeconds.toFixed(1)} s` },
    { type: 'slow 4G: 3D canvas', description: `${canvasSeconds.toFixed(1)} s` },
  )
})
