import type { Page } from '@playwright/test'
import {
  alertWith,
  blockWebGL,
  currentOutfit,
  garmentCard,
  openFittingRoom,
  PAGE_CHUNK,
  preset,
  stage,
  stageCanvas,
  statusWith,
  storageReady,
  VIEWER_CHUNK,
} from './support/fitting-room.ts'
import { waitForFirstFrame } from './support/marks.ts'
import { changedShare, FIGURE, homeRegion, settledStageShot } from './support/stage.ts'
import { expect, test } from './support/test.ts'

/** Wears two demo pieces on the Large body and saves them as "Look 1". */
async function dressAndSave(page: Page) {
  await garmentCard(page, 'Oxford stripe shirt').click()
  await garmentCard(page, 'Indigo denim').click()
  await expect(garmentCard(page, 'Indigo denim')).toHaveAttribute('aria-pressed', 'true')
  await preset(page, 'Large').click()
  const outfit = currentOutfit(page)
  await outfit.getByRole('button', { name: 'Save outfit' }).click()
  await expect(outfit.getByRole('textbox', { name: 'Name this outfit' })).toHaveValue('Look 1')
  await outfit.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(outfit.getByText('Saved as “Look 1”')).toBeVisible()
}

/** Records every request for the three.js viewer chunk. */
function watchViewerDownloads(page: Page) {
  const requests: string[] = []
  page.on('request', (request) => {
    if (VIEWER_CHUNK.test(request.url())) requests.push(request.url())
  })
  return requests
}

test.describe('without WebGL', () => {
  test.beforeEach(({ page }) => blockWebGL(page))

  test('explains, skips the 3D download, and outfits still save and come back', async ({ page }) => {
    const viewerDownloads = watchViewerDownloads(page)
    await page.goto('/fitting-room')
    await expect(statusWith(page, '3D preview unavailable')).toBeVisible()
    await expect(stage(page).locator('canvas')).toHaveCount(0)
    await expect(storageReady(page)).toBeVisible()

    await dressAndSave(page)

    await page.reload() // the init script applies again
    await expect(statusWith(page, '3D preview unavailable')).toBeVisible()
    await page.getByRole('tab', { name: /^Outfits 1/ }).click()
    const look = page.getByRole('article', { name: 'Look 1' })
    await look.getByRole('button', { name: 'Wear', exact: true }).click()
    await expect(look.getByRole('button', { name: 'Wearing' })).toBeDisabled()
    await expect(preset(page, 'Large')).toBeChecked()
    expect(viewerDownloads, 'the 3D viewer was downloaded anyway').toEqual([])
  })
})

test('says when a piece has no 3D shape yet, and keeps it in the outfit', async ({ page }) => {
  await openFittingRoom(page)
  const before = await settledStageShot(page)
  const coat = garmentCard(page, 'Camel wool overcoat')
  await coat.click()
  await expect(coat).toHaveAttribute('aria-pressed', 'true')
  await expect(statusWith(page, "Camel wool overcoat isn't shown in 3D yet")).toBeVisible()
  await expect(currentOutfit(page).getByRole('button', { name: 'Take off Camel wool overcoat' })).toBeVisible()
  // Nothing is drawn on the mannequin for it (the note sits below the figure).
  expect(changedShare(before, await settledStageShot(page), homeRegion(before, FIGURE))).toBeLessThan(0.001)
})

test('offers a restart when the browser takes the 3D context away', async ({ page }) => {
  await openFittingRoom(page)
  await stageCanvas(page).evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
  })
  const interrupted = alertWith(page, 'The 3D view was interrupted')
  await expect(interrupted).toBeVisible()
  await expect(stageCanvas(page)).toHaveCount(0)

  await interrupted.getByRole('button', { name: 'Restart the 3D view' }).click()
  await expect(interrupted).toBeHidden()
  await expect(stageCanvas(page)).toBeVisible()
  await settledStageShot(page)
})

test.describe('when part of the app fails to download', () => {
  // The browser, React and the error boundary all log these failures on purpose.
  test.use({ allowPageErrors: true })

  test('the fitting room explains, and Try again loads it once the connection is back', async ({ page }) => {
    await page.route(PAGE_CHUNK, (route) => route.abort('internetdisconnected'))
    await page.goto('/fitting-room')
    const error = alertWith(page, "The fitting room couldn't open")
    await expect(error).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible()

    await page.unroute(PAGE_CHUNK) // route handlers would survive the reload
    await error.getByRole('button', { name: 'Try again' }).click()
    await expect(storageReady(page)).toBeVisible()
    await expect(stageCanvas(page)).toBeVisible()
  })

  test('without the 3D viewer, the wardrobe keeps working, and a reload brings it back', async ({ page }) => {
    await page.route(VIEWER_CHUNK, (route) => route.abort('failed'))
    await page.goto('/fitting-room')
    await expect(alertWith(page, 'The 3D viewer stopped')).toBeVisible()
    const shirt = garmentCard(page, 'Oxford stripe shirt')
    await shirt.click()
    await expect(shirt).toHaveAttribute('aria-pressed', 'true')

    await page.unroute(VIEWER_CHUNK)
    await page.reload()
    await expect(stageCanvas(page)).toBeVisible()
    await waitForFirstFrame(page)
  })

  test('Try again brings the 3D viewer back without a reload', async ({ page }) => {
    await page.route(VIEWER_CHUNK, (route) => route.abort('failed'))
    await page.goto('/fitting-room')
    const stopped = alertWith(page, 'The 3D viewer stopped')
    await expect(stopped).toBeVisible()
    await page.unroute(VIEWER_CHUNK)
    await stopped.getByRole('button', { name: 'Try again' }).click()
    await expect(stageCanvas(page)).toBeVisible({ timeout: 5_000 })
  })
})
