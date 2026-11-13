import { expect, type CDPSession, type Locator, type Page } from '@playwright/test'
import type { FrameSample, MydrobePerfProbe } from '../../../src/lib/perf.ts'
import { stageCanvas } from '../../support/fitting-room.ts'
import { nextFrames, pageNow, waitForFitted } from '../../support/marks.ts'

/** What the observers collect in the page, on window.__perfObserved. */
export interface Observed {
  lcp: number
  events: { name: string; duration: number; start: number; target: string }[]
  loafs: { start: number; duration: number; blocking: number }[]
  lastPointerDown: number
  lastPointerUp: number
  /** When a file was last chosen in a file input. */
  lastFileChosen: number
  /** Commits per React renderer: react-dom for the page, @react-three/fiber for the 3D scene. */
  reactCommits: Record<string, number>
}

type PerfWindow = Window & { __perfObserved: Observed; __MYDROBE_PERF__?: MydrobePerfProbe }

/**
 * Collects what the browser reports while the page runs: the largest
 * contentful paint, interactions slower than 16 ms, long animation frames,
 * pointer presses and React commits. Install before the page loads.
 */
export function installObservers(page: Page) {
  return page.addInitScript(() => {
    const observed: Observed = {
      lcp: 0,
      events: [],
      loafs: [],
      lastPointerDown: 0,
      lastPointerUp: 0,
      lastFileChosen: 0,
      reactCommits: {},
    }
    ;(window as unknown as PerfWindow).__perfObserved = observed
    const observe = (type: string, options: object, each: (entry: PerformanceEntry) => void) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(each)).observe({ type, buffered: true, ...options })
      } catch {
        // Not reported by this browser.
      }
    }
    observe('largest-contentful-paint', {}, (entry) => {
      observed.lcp = entry.startTime
    })
    observe('event', { durationThreshold: 16 }, (entry) => {
      const target = (entry as PerformanceEventTiming).target as Element | null
      const label = target?.getAttribute('aria-label') ?? target?.textContent ?? target?.tagName ?? ''
      observed.events.push({ name: entry.name, duration: entry.duration, start: entry.startTime, target: label.trim().slice(0, 40) })
    })
    observe('long-animation-frame', {}, (entry) => {
      const blocking = (entry as PerformanceEntry & { blockingDuration?: number }).blockingDuration ?? 0
      observed.loafs.push({ start: entry.startTime, duration: entry.duration, blocking })
    })
    addEventListener('pointerdown', (event) => (observed.lastPointerDown = event.timeStamp), { capture: true })
    addEventListener('pointerup', (event) => (observed.lastPointerUp = event.timeStamp), { capture: true })
    addEventListener(
      'change',
      (event) => {
        if ((event.target as HTMLInputElement | null)?.type === 'file') observed.lastFileChosen = event.timeStamp
      },
      { capture: true },
    )

    // React reports every commit to the DevTools hook, even in production builds.
    const renderers = new Map<number, { rendererPackageName?: string }>()
    ;(window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      isDisabled: false,
      renderers,
      inject(internals: { rendererPackageName?: string }) {
        const id = renderers.size + 1
        renderers.set(id, internals)
        return id
      },
      onCommitFiberRoot(id: number) {
        const name = renderers.get(id)?.rendererPackageName ?? `renderer ${id}`
        observed.reactCommits[name] = (observed.reactCommits[name] ?? 0) + 1
      },
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    }
  })
}

export const observed = (page: Page) => page.evaluate(() => (window as unknown as PerfWindow).__perfObserved)

export async function waitForProbe(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as PerfWindow).__MYDROBE_PERF__))).toBe(true)
}
export const clearFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as PerfWindow).__MYDROBE_PERF__!.clearFrames())
export const probedFrames = (page: Page) => page.evaluate(() => (window as unknown as PerfWindow).__MYDROBE_PERF__!.frames())

export const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places

export function percentile(values: number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)])
}
export const median = (values: number[]) => percentile(values, 50)

/** Frame rate and pacing from probed frames: gaps between frame starts, and CPU time per frame. */
export function frameStats(frames: FrameSample[]) {
  if (frames.length < 2) return { frames: frames.length, fps: null, gapP50: null, gapP95: null, slowFrames: 0, cpuP50: null, cpuP95: null }
  const gaps = frames.slice(1).map((frame, i) => frame.start - frames[i].start)
  const span = frames[frames.length - 1].start - frames[0].start
  return {
    frames: frames.length,
    fps: round((frames.length - 1) / (span / 1000)),
    gapP50: percentile(gaps, 50),
    gapP95: percentile(gaps, 95),
    // Gaps that missed a beat even at 30 FPS.
    slowFrames: gaps.filter((gap) => gap > 1000 / 30 + 0.5).length,
    cpuP50: percentile(frames.map((frame) => frame.cpu), 50),
    cpuP95: percentile(frames.map((frame) => frame.cpu), 95),
  }
}

/** Load timings in ms from navigation start, and the JavaScript transferred, in kB. */
export function loadMetrics(page: Page) {
  return page.evaluate(() => {
    const observed = (window as unknown as PerfWindow).__perfObserved
    const at = (name: string) => performance.getEntriesByName(name)[0]?.startTime ?? null
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const scripts = resources.filter((entry) => /\.js(\?|$)/.test(entry.name))
    const viewer = resources.find((entry) => /\/assets\/FittingRoom-[\w-]+\.js(\?|$)/.test(entry.name))
    const kb = (bytes: number) => Math.round(bytes / 102.4) / 10
    return {
      ttfb: navigation?.responseStart ?? null,
      fcp: at('first-contentful-paint'),
      lcp: observed.lcp || null,
      fittingRoomShown: at('mydrobe:fitting-room-shown'),
      wardrobeReady: at('mydrobe:wardrobe-ready'),
      viewerChunkLoaded: viewer?.responseEnd ?? null,
      canvasCreated: at('mydrobe:canvas-created'),
      firstFrame: at('mydrobe:first-frame'),
      longFrameBlocking: Math.round(observed.loafs.reduce((sum, frame) => sum + frame.blocking, 0)),
      // As sent (compressed by the preview server) and once unpacked.
      jsCompressedKb: kb(scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0)),
      jsRawKb: kb(scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0)),
    }
  })
}

type Pointer = 'mouse' | CDPSession

/**
 * Drags across the middle of the stage for `ms`, moving every 16 ms like a
 * steady hand, a full turn in all, and returns the frames drawn between
 * pressing and letting go. Touch goes through `cdp` when given.
 */
export async function rotate(page: Page, pointer: Pointer = 'mouse', ms = 3000) {
  const box = await stageCanvas(page).boundingBox()
  if (!box) throw new Error('The 3D canvas is not on screen')
  const y = box.y + box.height / 2
  const from = box.x + box.width / 2 - box.height / 2
  const steps = Math.round(ms / 16)
  const at = (i: number) => ({ x: from + (box.height * i) / steps, y })
  const press = async (type: 'down' | 'move' | 'up', point: { x: number; y: number }) => {
    if (pointer === 'mouse') {
      if (type === 'move') await page.mouse.move(point.x, point.y)
      else if (type === 'down') {
        await page.mouse.move(point.x, point.y)
        await page.mouse.down()
      } else await page.mouse.up()
    } else {
      const kind = ({ down: 'touchStart', move: 'touchMove', up: 'touchEnd' } as const)[type]
      await pointer.send('Input.dispatchTouchEvent', { type: kind, touchPoints: type === 'up' ? [] : [{ ...point, id: 0 }] })
    }
  }

  await nextFrames(page)
  await clearFrames(page)
  await press('down', at(0))
  const started = Date.now()
  for (let i = 1; i <= steps; i++) {
    await press('move', at(i))
    const wait = started + i * 16 - Date.now()
    if (wait > 0) await page.waitForTimeout(wait) // the hand's pace, not a wait for some state
  }
  await press('up', at(steps))
  const { down, up } = await observed(page).then((o) => ({ down: o.lastPointerDown, up: o.lastPointerUp }))
  const frames = (await probedFrames(page)).filter((frame) => frame.start >= down && frame.start <= up)
  return frameStats(frames)
}

/** From pressing a card to the end of the first frame drawn after it, in ms. */
export async function clickToFrame(page: Page, target: Locator) {
  await nextFrames(page)
  await clearFrames(page)
  await target.click()
  await expect.poll(async () => (await probedFrames(page)).length).toBeGreaterThan(0)
  const down = (await observed(page)).lastPointerDown
  const frame = (await probedFrames(page)).find((each) => each.start >= down)!
  return round(frame.start + frame.cpu - down)
}

/**
 * Wears a photo garment and times each step: press to fitting start, the
 * photo analysis, the textures, and on to the frame that shows it.
 */
export async function clickToFitted(page: Page, target: Locator) {
  const since = await pageNow(page)
  await target.click()
  await waitForFitted(page, since)
  return page.evaluate((since) => {
    const perf = window as unknown as PerfWindow
    const down = perf.__perfObserved.lastPointerDown
    const first = (name: string) => performance.getEntriesByName(name).find((entry) => entry.startTime >= since)
    const start = first('mydrobe:fit-start')
    const fitted = first('mydrobe:garment-fitted')
    const analysis = first('mydrobe:photo-analysis')
    const frame = fitted && perf.__MYDROBE_PERF__!.frames().find((each) => each.start >= fitted.startTime)
    const r = (value: number | undefined) => (value === undefined ? null : Math.round(value * 10) / 10)
    return {
      total: r(frame ? frame.start + frame.cpu - down : undefined),
      pressToFitStart: r(start && start.startTime - down),
      analysis: r(analysis?.duration),
      fitStartToFitted: r(start && fitted && fitted.startTime - start.startTime),
      fittedToFrame: r(frame && fitted && frame.start + frame.cpu - fitted.startTime),
    }
  }, since)
}

/** Waits until no frame has been drawn for `quietMs`, then gives the press-to-last-frame time and the frames. */
export async function untilStill(page: Page, quietMs = 400) {
  let count = -1
  for (;;) {
    await page.waitForTimeout(quietMs) // a quiet stretch to watch, not a wait for some state
    const frames = await probedFrames(page)
    if (frames.length === count) {
      const down = (await observed(page)).lastPointerDown
      const after = frames.filter((frame) => frame.start >= down)
      const last = after[after.length - 1]
      return { ms: last ? round(last.start + last.cpu - down) : null, frames: frameStats(after) }
    }
    count = frames.length
  }
}

/** Resolves with the page's clock once `text` is on the page (or gone, with `gone`), checked every frame. */
export function timeWhen(page: Page, text: string, { gone = false, timeout = 120_000 } = {}) {
  return page.evaluate(
    ({ text, gone, timeout }) =>
      new Promise<number>((resolve, reject) => {
        const deadline = performance.now() + timeout
        const check = () => {
          if ((document.body.textContent ?? '').includes(text) !== gone) resolve(performance.now())
          else if (performance.now() > deadline) reject(new Error(`Timed out waiting for "${text}"`))
          else requestAnimationFrame(check)
        }
        check()
      }),
    { text, gone, timeout },
  )
}

/** Long animation frames between two moments: their total blocking time and the longest. */
export async function longFramesBetween(page: Page, from: number, to: number) {
  const { loafs } = await observed(page)
  const during = loafs.filter((frame) => frame.start >= from && frame.start <= to)
  return {
    longFrames: during.length,
    blockingMs: round(during.reduce((sum, frame) => sum + frame.blocking, 0)),
    longestMs: round(Math.max(0, ...during.map((frame) => frame.duration))),
  }
}

/** Interactions the browser timed at 100 ms or more, and the slowest of all. */
export async function slowInteractions(page: Page) {
  const { events } = await observed(page)
  const worst = [...events].sort((a, b) => b.duration - a.duration)[0] ?? null
  return {
    over100ms: events.filter((event) => event.duration >= 100).length,
    worst: worst && { name: worst.name, ms: round(worst.duration), target: worst.target },
  }
}
