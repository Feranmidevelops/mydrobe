import type { Page } from '@playwright/test'
import type { MydrobePerfProbe } from '../src/lib/perf.ts'
import { PHOTOS } from './fixtures/photos.ts'
import {
  garmentCard,
  openFittingRoom,
  PAGE_CHUNK,
  photoGarment,
  seedGarments,
  VIEWER_CHUNK,
} from './support/fitting-room.ts'
import { pageNow, waitForFitted } from './support/marks.ts'
import { dragStage, settledStageShot } from './support/stage.ts'
import { expect, test } from './support/test.ts'

/*
 * What opening the fitting room costs: what it downloads and what it starts.
 * The performance suite (e2e/perf) measures how long things take; these are
 * the cheap yes-or-no checks that guard it on every run.
 */

const PROBE_CHUNK = /\/assets\/PerfProbe-[\w-]+\.js$/

type Probed = Window & { __MYDROBE_PERF__?: MydrobePerfProbe }
const probe = (page: Page) => page.evaluate(() => (window as Probed).__MYDROBE_PERF__ !== undefined)
const probedFrames = (page: Page) => page.evaluate(() => (window as Probed).__MYDROBE_PERF__!.frames().length)
const clearProbedFrames = (page: Page) => page.evaluate(() => (window as Probed).__MYDROBE_PERF__!.clearFrames())

test('the landing page downloads neither the fitting room nor its 3D viewer until you head there', async ({ page }) => {
  const chunks: string[] = []
  page.on('request', (request) => {
    if (PAGE_CHUNK.test(request.url()) || VIEWER_CHUNK.test(request.url())) chunks.push(request.url())
  })
  // The pointer starts in the corner, so nothing hovers the way in and starts fetching it early.
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Enter the fitting room' }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(chunks).toEqual([])
})

test('saved photos cost nothing at startup: no worker, analysis, garment textures or model files until one is worn', async ({
  page,
}) => {
  await openFittingRoom(page)
  await seedGarments(page, [
    photoGarment('Saved red shirt', PHOTOS.shirt, 'shirt', '#b3261e'),
    photoGarment('Saved blue trousers', PHOTOS.trousers, 'trousers', '#1f4e9c'),
  ])

  const workers: string[] = []
  const heavy: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  page.on('request', (request) => {
    if (/photo-analysis\.worker|\.(glb|gltf|hdr|exr)(\?|$)/.test(request.url())) heavy.push(request.url())
  })
  await openFittingRoom(page, '/fitting-room?perf')
  await expect(garmentCard(page, 'Saved red shirt')).toBeVisible()
  await expect.poll(() => probe(page)).toBe(true)
  await page.waitForLoadState('networkidle')

  expect(workers).toEqual([])
  expect(heavy).toEqual([])
  const entries = await page.evaluate(() =>
    ['mydrobe:photo-analysis', 'mydrobe:fit-start'].map((name) => performance.getEntriesByName(name).length),
  )
  expect(entries, 'photo analyses and fittings').toEqual([0, 0])
  expect((await page.evaluate(() => (window as Probed).__MYDROBE_PERF__!.textures())).canvas).toBe(0)

  // Wearing one is what starts the work.
  const since = await pageNow(page)
  await garmentCard(page, 'Saved red shirt').click()
  await waitForFitted(page, since)
  expect(workers).not.toEqual([])
})

test('a normal visit never downloads the performance probe', async ({ page }) => {
  const downloads: string[] = []
  page.on('request', (request) => {
    if (PROBE_CHUNK.test(request.url())) downloads.push(request.url())
  })
  await openFittingRoom(page)
  expect(downloads).toEqual([])
  expect(await probe(page)).toBe(false)
})

test('with ?perf the probe counts the frames drawn, and the 3D view draws none while it stands still', async ({
  page,
}) => {
  await openFittingRoom(page, '/fitting-room?perf')
  await expect.poll(() => probe(page)).toBe(true)

  await clearProbedFrames(page)
  await dragStage(page, 100)
  expect(await probedFrames(page)).toBeGreaterThan(5)

  // Frames are drawn only on demand, so once the view has settled nothing more is drawn.
  await settledStageShot(page)
  await clearProbedFrames(page)
  await page.waitForTimeout(2_000) // an idle stretch to watch, not a wait for some state
  expect(await probedFrames(page)).toBe(0)
})
