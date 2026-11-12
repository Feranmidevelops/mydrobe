import type { Page } from '@playwright/test'
import type { MydrobePerfProbe } from '../src/lib/perf.ts'
import { openFittingRoom } from './support/fitting-room.ts'
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
