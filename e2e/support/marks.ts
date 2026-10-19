import { expect, type Page } from '@playwright/test'

/*
 * Waiting on the app's own timing marks (src/lib/perf.ts) rather than on how
 * the screen happens to look: they say exactly when the 3D view first drew
 * and when each photo garment finished fitting onto the mannequin.
 */

const MARKS = {
  firstFrame: 'mydrobe:first-frame',
  garmentFitted: 'mydrobe:garment-fitted',
  fitFailed: 'mydrobe:fit-failed',
} as const

/** The page's clock, to note just before an action so later marks can be told apart. */
export const pageNow = (page: Page) => page.evaluate(() => performance.now())

/** Resolves once two animation frames have passed, so anything asked for has been drawn. */
export const nextFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))

export async function waitForFirstFrame(page: Page) {
  await expect
    .poll(() => page.evaluate((name) => performance.getEntriesByName(name).length, MARKS.firstFrame), { timeout: 30_000 })
    .toBeGreaterThan(0)
}

/**
 * Waits until `count` different photo garments have finished fitting (or
 * failed to) since `since`, then lets a frame draw the result. Demo pieces
 * are drawn straight away and leave no marks, so count photo garments only.
 */
export async function waitForFitted(page: Page, since: number, count = 1) {
  const finished = () =>
    page.evaluate(
      ({ since, names }) =>
        new Set(
          names.flatMap((name) =>
            performance
              .getEntriesByName(name)
              .filter((entry) => entry.startTime >= since)
              .map((entry) => (entry as PerformanceMark).detail?.garmentId as string),
          ),
        ).size,
      { since, names: [MARKS.garmentFitted, MARKS.fitFailed] },
    )
  await expect.poll(finished, { timeout: 45_000 }).toBeGreaterThanOrEqual(count)
  await nextFrames(page)
}

/** How many photo garments have failed to fit since `since`. */
export const fitFailures = (page: Page, since: number) =>
  page.evaluate(
    ({ since, name }) => performance.getEntriesByName(name).filter((entry) => entry.startTime >= since).length,
    { since, name: MARKS.fitFailed },
  )
