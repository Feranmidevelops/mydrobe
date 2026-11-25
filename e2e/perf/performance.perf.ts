import { devices, type Browser, type Page } from '@playwright/test'
import type { MydrobePerfProbe } from '../../src/lib/perf.ts'
import { PHOTOS } from '../fixtures/photos.ts'
import {
  blockWebGL,
  cameraButton,
  currentOutfit,
  garmentCard,
  PAGE_CHUNK,
  photoGarment,
  preset,
  seedGarments,
  stageCanvas,
  statusWith,
  storageReady,
  VIEWER_CHUNK,
} from '../support/fitting-room.ts'
import { nextFrames, pageNow, waitForFitted } from '../support/marks.ts'
import { expect, test } from '../support/test.ts'
import { recordEnvironment } from './support/perf-env.ts'
import {
  clearFrames,
  clickToFitted,
  clickToFrame,
  installObservers,
  loadMetrics,
  longFramesBetween,
  median,
  observed,
  rotate,
  round,
  slowInteractions,
  timeWhen,
  untilStill,
  waitForProbe,
} from './support/perf-page.ts'
import { finishRun, record, startRun } from './support/results.ts'
import { PROFILES, throttle, type Profile } from './support/throttling.ts'
import { trackWebGLMemory, type WebGLMemory } from './support/webgl-memory.ts'

/*
 * How fast Mydrobe loads and responds, measured rather than judged: npm run test:perf.
 * Each test saves its numbers as soon as it has them (see results.ts). Checks are
 * soft, so one surprise doesn't stop the rest of the measurements.
 */

/** Repeats of each cold load, after a first one reported on its own (a cold shader cache). */
const RUNS = Math.max(1, Number(process.env.PERF_RUNS ?? 5))

const PERF_SHIRT = photoGarment('Perf shirt', PHOTOS.shirt, 'shirt', '#b3261e')
const PERF_TROUSERS = photoGarment('Perf trousers', PHOTOS.trousers, 'trousers', '#1f4e9c')

type Probed = Window & { __MYDROBE_PERF__?: MydrobePerfProbe; __webglMemory?: () => WebGLMemory }

/** A fresh context: an empty cache and an empty saved wardrobe, as on a first visit. */
async function freshPage(browser: Browser, options: Parameters<Browser['newContext']>[0] = {}) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await installObservers(page)
  return { context, page }
}

const waitForMark = (page: Page, name: string, timeout = 120_000) =>
  expect
    .poll(() => page.evaluate((name) => performance.getEntriesByName(name).length, name), { timeout })
    .toBeGreaterThan(0)

/** Opens the fitting room with the two perf photo garments saved, then again with the probe on. */
async function openWithSavedPhotos(page: Page) {
  await page.goto('/fitting-room')
  await expect(storageReady(page)).toBeVisible()
  await seedGarments(page, [PERF_SHIRT, PERF_TROUSERS])
  await page.goto('/fitting-room?perf')
  await expect(storageReady(page)).toBeVisible()
  await expect(stageCanvas(page)).toBeVisible()
  await waitForMark(page, 'mydrobe:first-frame')
  await waitForProbe(page)
}

/** The first run on its own, then the median, fastest and slowest of the rest, for every number. */
function summarise<T extends Record<string, number | null>>(runs: T[]) {
  const [first, ...rest] = runs
  const values = (key: string) => rest.map((run) => run[key]).filter((value): value is number => typeof value === 'number')
  const each = (pick: (values: number[]) => number | null) =>
    Object.fromEntries(Object.keys(first).map((key) => [key, pick(values(key))]))
  return {
    firstRun: first,
    runs: rest.length,
    median: each(median),
    fastest: each((list) => (list.length ? round(Math.min(...list)) : null)),
    slowest: each((list) => (list.length ? round(Math.max(...list)) : null)),
  }
}

async function coldFittingRoom(browser: Browser, profile: Profile) {
  const { context, page } = await freshPage(browser)
  try {
    await throttle(page, profile)
    await page.goto('/fitting-room?perf', { waitUntil: 'commit' })
    await waitForMark(page, 'mydrobe:wardrobe-ready')
    await waitForMark(page, 'mydrobe:first-frame')
    return await loadMetrics(page)
  } finally {
    await context.close()
  }
}

async function coldViaLanding(browser: Browser, profile: Profile) {
  const { context, page } = await freshPage(browser)
  try {
    const early: string[] = []
    page.on('request', (request) => {
      if (PAGE_CHUNK.test(request.url()) || VIEWER_CHUNK.test(request.url())) early.push(request.url())
    })
    await throttle(page, profile)
    await page.goto('/?perf', { waitUntil: 'load', timeout: 120_000 })
    const link = page.getByRole('link', { name: 'Enter the fitting room' }).first()
    await expect(link).toBeVisible()
    await page.waitForTimeout(500) // lets the largest paint settle before it's read
    const landing = await loadMetrics(page)
    const fetchedBeforeHover = early.length

    // Pointing at the way in starts fetching the fitting room; a person takes a moment to click.
    await link.hover()
    await page.waitForTimeout(300) // a person's pause before clicking, not a wait for some state
    await link.click()
    await waitForMark(page, 'mydrobe:first-frame')
    const after = await page.evaluate(() => {
      const down = (window as unknown as { __perfObserved: { lastPointerDown: number } }).__perfObserved.lastPointerDown
      const at = (name: string) => performance.getEntriesByName(name)[0]?.startTime ?? NaN
      return { shown: at('mydrobe:fitting-room-shown') - down, firstFrame: at('mydrobe:first-frame') - down }
    })
    return {
      ttfb: landing.ttfb,
      fcp: landing.fcp,
      lcp: landing.lcp,
      landingJsCompressedKb: landing.jsCompressedKb,
      clickToFittingRoomShown: round(after.shown),
      clickToFirstFrame: round(after.firstFrame),
      fetchedBeforeHover,
    }
  } finally {
    await context.close()
  }
}

test('environment', async ({ page, browser }) => {
  startRun()
  await page.goto('/')
  const environment = await recordEnvironment(page, browser)
  record('environment', environment)
  test.info().annotations.push({ type: 'renderer', description: environment.renderer })
  if (test.info().project.name === 'perf-gpu') {
    expect.soft(environment.softwareRendering, 'drawn on the real GPU').toBe(false)
  }
  expect.soft(environment.power?.onBattery ?? false, 'plugged in').toBe(false)
})

test('cold loads', async ({ browser }) => {
  const results: Record<string, unknown> = {}
  for (const key of ['broadband', 'fast4g', 'slow4g'] as const) {
    const profile = PROFILES[key]
    const direct = []
    const viaLanding = []
    for (let run = 0; run <= RUNS; run++) {
      direct.push(await coldFittingRoom(browser, profile))
      viaLanding.push(await coldViaLanding(browser, profile))
    }
    for (const run of viaLanding) {
      expect.soft(run.fetchedBeforeHover, `${profile.label}: the landing page fetched fitting room code unasked`).toBe(0)
    }
    results[key] = { conditions: profile.source, direct: summarise(direct), viaLanding: summarise(viaLanding) }
    record('coldLoads', results)
  }
})

test('startup with saved photos', async ({ browser }) => {
  const results = []
  for (const count of [0, 10, 30]) {
    const { context, page } = await freshPage(browser)
    try {
      const garments = Array.from({ length: count }, (_, i) =>
        i % 2
          ? photoGarment(`Saved trousers ${i}`, PHOTOS.trousers, 'trousers', '#1f4e9c')
          : photoGarment(`Saved shirt ${i}`, PHOTOS.shirt, 'shirt', '#b3261e'),
      )
      await page.goto('/fitting-room')
      await expect(storageReady(page)).toBeVisible()
      if (garments.length) await seedGarments(page, garments)
      await page.goto('/fitting-room?perf')
      await expect(storageReady(page)).toBeVisible()
      await waitForMark(page, 'mydrobe:first-frame')
      const startup = await page.evaluate(() => {
        const ready = performance.getEntriesByName('mydrobe:wardrobe-ready')[0] as PerformanceMark
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        return {
          wardrobeReady: Math.round(ready.startTime),
          readingMs: Math.round((ready.detail as { ms?: number } | null)?.ms ?? NaN),
          firstFrame: Math.round(performance.getEntriesByName('mydrobe:first-frame')[0].startTime),
          jsHeapMb: memory ? Math.round(memory.usedJSHeapSize / 2 ** 20) : null,
        }
      })
      const storedKb = garments.reduce((sum, garment) => sum + garment.photo.length + (garment.thumbnail?.length ?? 0), 0) / 1024
      results.push({ savedPhotos: count, storedImageKb: Math.round(storedKb), ...startup })
      record('startupWithSavedPhotos', results)
    } finally {
      await context.close()
    }
  }
})

test('desktop interactions', async ({ browser }) => {
  const results: Record<string, unknown> = {}
  for (const cpu of [1, 4]) {
    const { context, page } = await freshPage(browser)
    try {
      await openWithSavedPhotos(page)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
      const pageCommits = async () => (await observed(page)).reactCommits['react-dom'] ?? 0

      let before = await pageCommits()
      const rotationEmpty = await rotate(page)
      const pageCommitsTurningEmpty = (await pageCommits()) - before

      const wearDemoShirt = await clickToFrame(page, garmentCard(page, 'Oxford stripe shirt'))
      const wearDemoTrousers = await clickToFrame(page, garmentCard(page, 'Indigo denim'))
      before = await pageCommits()
      const rotationDressed = await rotate(page)
      const pageCommitsTurningDressed = (await pageCommits()) - before

      // Not yet analysed in this visit, so each goes through the whole fitting.
      const wearPhotoShirt = await clickToFitted(page, garmentCard(page, 'Perf shirt'))
      const wearPhotoTrousers = await clickToFitted(page, garmentCard(page, 'Perf trousers'))

      const presets: Record<string, number | null> = {}
      for (const name of ['Large', 'Small', 'Medium'] as const) {
        const since = await pageNow(page)
        await preset(page, name).click()
        await waitForFitted(page, since, 2) // both photo garments are fitted again to the new body
        presets[name] = (await untilStill(page)).ms
      }

      await nextFrames(page)
      await clearFrames(page)
      await cameraButton(page, 'Side').click()
      const glideToSide = await untilStill(page)

      results[`cpu${cpu}x`] = {
        rotationEmpty,
        pageCommitsTurningEmpty,
        wearDemoShirt,
        wearDemoTrousers,
        rotationDressed,
        pageCommitsTurningDressed,
        wearPhotoShirt,
        wearPhotoTrousers,
        presetToStill: presets,
        glideToSide,
        slowInteractions: await slowInteractions(page),
      }
      record('desktopInteractions', results)
      expect.soft(pageCommitsTurningEmpty, `${cpu}x CPU: page re-renders while turning`).toBe(0)
      expect.soft(pageCommitsTurningDressed, `${cpu}x CPU: page re-renders while turning, dressed`).toBe(0)
    } finally {
      await context.close()
    }
  }
})

test('touch rotation on a phone', async ({ browser }) => {
  const { context, page } = await freshPage(browser, { ...devices['Pixel 7'] })
  try {
    await page.goto('/fitting-room?perf')
    await expect(storageReady(page)).toBeVisible()
    await waitForMark(page, 'mydrobe:first-frame')
    await waitForProbe(page)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const before = (await observed(page)).reactCommits['react-dom'] ?? 0
    const rotation = await rotate(page, cdp)
    const pageCommitsTurning = ((await observed(page)).reactCommits['react-dom'] ?? 0) - before
    record('touchRotation', {
      device: "Chromium's Pixel 7: 412×839 at 2.625x, with a 4x CPU slow-down. The GPU isn't slowed.",
      rotation,
      pageCommitsTurning,
    })
    expect.soft(pageCommitsTurning, 'page re-renders while turning').toBe(0)
  } finally {
    await context.close()
  }
})

test('without WebGL', async ({ browser }) => {
  const { context, page } = await freshPage(browser)
  try {
    const viewer: string[] = []
    page.on('request', (request) => {
      if (VIEWER_CHUNK.test(request.url())) viewer.push(request.url())
    })
    await blockWebGL(page)
    await page.goto('/fitting-room')
    await expect(statusWith(page, '3D preview unavailable')).toBeVisible()
    await expect(storageReady(page)).toBeVisible()
    await page.waitForLoadState('networkidle')
    const metrics = await loadMetrics(page)
    record('withoutWebGL', {
      viewerDownloads: viewer.length,
      jsCompressedKb: metrics.jsCompressedKb,
      jsRawKb: metrics.jsRawKb,
      fittingRoomShown: metrics.fittingRoomShown && round(metrics.fittingRoomShown),
      wardrobeReady: metrics.wardrobeReady && round(metrics.wardrobeReady),
    })
    expect.soft(viewer, 'the 3D viewer is never downloaded').toEqual([])
  } finally {
    await context.close()
  }
})

test('GPU memory', async ({ browser }) => {
  const { context, page } = await freshPage(browser)
  try {
    await trackWebGLMemory(page)
    await openWithSavedPhotos(page)
    const snapshot = () =>
      page.evaluate(() => {
        const probe = (window as Probed).__MYDROBE_PERF__!
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        const renderer = probe.renderer()
        return {
          geometries: renderer.geometries,
          textures: renderer.textures,
          programs: renderer.programs,
          sceneTextures: probe.textures(),
          geometryKb: Math.round(probe.geometryBytes() / 1024),
          webgl: (window as Probed).__webglMemory!(),
          jsHeapMb: memory ? Math.round(memory.usedJSHeapSize / 2 ** 20) : null,
          photoAnalyses: performance.getEntriesByName('mydrobe:photo-analysis').length,
        }
      })
    const settle = () => untilStill(page, 250)
    type Snapshot = Awaited<ReturnType<typeof snapshot>>

    const empty = await snapshot()
    let since = await pageNow(page)
    await garmentCard(page, 'Perf shirt').click()
    await garmentCard(page, 'Perf trousers').click()
    await waitForFitted(page, since, 2)
    await settle()
    const dressed = await snapshot()

    const switches: Snapshot[] = []
    const order = ['Large', 'Small', 'Medium'] as const
    for (let i = 0; i < 9; i++) {
      since = await pageNow(page)
      await preset(page, order[i % 3]).click()
      await waitForFitted(page, since, 2)
      await settle()
      switches.push(await snapshot())
    }

    // Swap each photo garment for a demo piece and back, ten times over.
    const swaps: Snapshot[] = []
    for (let i = 0; i < 10; i++) {
      await garmentCard(page, 'Oxford stripe shirt').click()
      await garmentCard(page, 'Indigo denim').click()
      await settle()
      since = await pageNow(page)
      await garmentCard(page, 'Perf shirt').click()
      await garmentCard(page, 'Perf trousers').click()
      await waitForFitted(page, since, 2)
      await settle()
      swaps.push(await snapshot())
    }

    const outfit = currentOutfit(page)
    await outfit.getByRole('button', { name: 'Take off Perf shirt' }).click()
    await outfit.getByRole('button', { name: 'Take off Perf trousers' }).click()
    await settle()
    const undressed = await snapshot()

    const perStep = (list: Snapshot[], pick: (each: Snapshot) => number) =>
      round((pick(list[list.length - 1]) - pick(list[0])) / (list.length - 1))
    const results = {
      empty,
      dressed,
      afterNineBodySwitches: switches[switches.length - 1],
      afterTenSwaps: swaps[swaps.length - 1],
      undressed,
      texturesPerBodySwitch: perStep(switches, (each) => each.textures),
      webglKbPerBodySwitch: perStep(switches, (each) => each.webgl.totalBytes / 1024),
      texturesPerSwap: perStep(swaps, (each) => each.textures),
      webglKbPerSwap: perStep(swaps, (each) => each.webgl.totalBytes / 1024),
      photoAnalysesDuringSwaps: swaps[swaps.length - 1].photoAnalyses - swaps[0].photoAnalyses,
    }
    record('gpuMemory', results)

    expect.soft(undressed.textures, 'textures left once undressed').toBe(empty.textures)
    expect.soft(undressed.geometries, 'geometries left once undressed').toBe(empty.geometries)
    expect.soft(results.webglKbPerBodySwitch, 'GPU memory kept growing with body switches').toBeLessThan(64)
    expect.soft(results.webglKbPerSwap, 'GPU memory kept growing with garment swaps').toBeLessThan(64)
    expect.soft(results.photoAnalysesDuringSwaps, 'photos analysed again when worn again').toBe(0)
  } finally {
    await context.close()
  }
})

test('large photo upload', async ({ browser }) => {
  const { context, page } = await freshPage(browser)
  try {
    await page.goto('/fitting-room?perf')
    await expect(storageReady(page)).toBeVisible()
    await waitForMark(page, 'mydrobe:first-frame')
    await waitForProbe(page)

    // A phone camera's photo: the test shirt at 3024×4032 with a little sensor noise, as JPEG 0.92.
    const base64 = await page.evaluate(async (png) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(3024, 4032)
      const g = canvas.getContext('2d')!
      g.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = g.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < pixels.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 10
        pixels.data[i] += noise
        pixels.data[i + 1] += noise
        pixels.data[i + 2] += noise
      }
      g.putImageData(pixels, 0, 0)
      const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer())
      let binary = ''
      for (let i = 0; i < jpeg.length; i += 0x8000) binary += String.fromCharCode(...jpeg.subarray(i, i + 0x8000))
      return btoa(binary)
    }, PHOTOS.shirt.buffer.toString('base64'))
    const photo = Buffer.from(base64, 'base64')

    await page.getByRole('button', { name: /^Add clothes/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Add clothes' })
    await dialog.getByLabel('Choose a photo').setInputFiles({ name: 'phone-photo.jpg', mimeType: 'image/jpeg', buffer: photo })
    const reviewShown = await timeWhen(page, 'Check how it came out')
    const analysed = await timeWhen(page, 'Finding the garment…', { gone: true })
    const chosen = (await observed(page)).lastFileChosen
    const blocking = await longFramesBetween(page, chosen, analysed)
    const analysisMs = await page.evaluate(() => performance.getEntriesByName('mydrobe:photo-analysis').at(-1)?.duration ?? null)

    const add = dialog.getByRole('button', { name: 'Add to wardrobe' })
    await expect(add).toBeEnabled()
    const addToFitted = await clickToFitted(page, add)

    record('largeUpload', {
      photo: { width: 3024, height: 4032, kb: Math.round(photo.length / 1024) },
      chosenToReview: round(reviewShown - chosen),
      chosenToAnalysed: round(analysed - chosen),
      analysisMs: analysisMs && round(analysisMs),
      whileProcessing: blocking,
      addToFitted,
    })
  } finally {
    await context.close()
  }
})

test.afterAll(() => {
  finishRun()
})
