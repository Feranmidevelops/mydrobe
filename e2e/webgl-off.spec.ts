import { stage, statusWith, storageReady, VIEWER_CHUNK } from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'

test('without WebGL 2 the fitting room explains, stays 2D and skips the 3D download', async ({ page }, info) => {
  test.fail(info.project.name === 'webgl1-only', 'supportsWebGL accepts WebGL 1, but three.js r186 needs WebGL 2')
  const viewerDownloads: string[] = []
  page.on('request', (request) => {
    if (VIEWER_CHUNK.test(request.url())) viewerDownloads.push(request.url())
  })
  await page.goto('/fitting-room')

  // Fail loudly if a future Chromium stops honouring the switches.
  const available = await page.evaluate(() => ({
    webgl2: !!document.createElement('canvas').getContext('webgl2'),
    webgl: !!document.createElement('canvas').getContext('webgl'),
  }))
  expect(available.webgl2).toBe(false)
  expect(available.webgl).toBe(info.project.name === 'webgl1-only')

  await expect(statusWith(page, '3D preview unavailable')).toBeVisible()
  await expect(stage(page).locator('canvas')).toHaveCount(0)
  await expect(storageReady(page)).toBeVisible()
  expect(viewerDownloads, 'the 3D viewer was downloaded anyway').toEqual([])
})
