import type { Page } from '@playwright/test'
import type { MydrobePerfProbe } from '../src/lib/perf.ts'
import { garmentCard, openFittingRoom, preset } from './support/fitting-room.ts'
import { nextFrames } from './support/marks.ts'
import { expect, test } from './support/test.ts'

/*
 * Switching body size should only do what a new size needs. A demo fabric's
 * flecks are tens of thousands of tiny rectangles, and drawing them all again
 * kept the page and the graphics card busy; the mannequin's and the clothes'
 * shapes for every size can be worked out while the page stands idle.
 */

type Counted = Window & { __fillRects?: number }
type Probed = Window & { __MYDROBE_PERF__?: MydrobePerfProbe }

const fillRects = (page: Page) => page.evaluate(() => (window as Counted).__fillRects ?? 0)
const geometryBuilds = (page: Page) => page.evaluate(() => (window as Probed).__MYDROBE_PERF__!.geometryBuilds())

test('switching body size draws no fabric again', async ({ page }) => {
  await page.addInitScript(() => {
    const counted = window as Counted
    counted.__fillRects = 0
    const fillRect = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (this: CanvasRenderingContext2D, x, y, width, height) {
      counted.__fillRects! += 1
      fillRect.call(this, x, y, width, height)
    }
  })
  await openFittingRoom(page)
  await garmentCard(page, 'Oxford stripe shirt').click()
  await garmentCard(page, 'Indigo denim').click()
  await nextFrames(page)

  for (const size of ['Large', 'Small'] as const) {
    const before = await fillRects(page)
    await preset(page, size).click()
    await nextFrames(page)
    expect((await fillRects(page)) - before, `rectangles drawn for ${size}`).toBeLessThan(100)
  }
})

test('switching body size finds every size already built', async ({ page }) => {
  await openFittingRoom(page, '/fitting-room?perf')
  await expect.poll(() => page.evaluate(() => (window as Probed).__MYDROBE_PERF__ !== undefined)).toBe(true)
  await garmentCard(page, 'Oxford stripe shirt').click()
  await garmentCard(page, 'Indigo denim').click()
  // While it stands idle, the page builds every size of the mannequin and of what's worn.
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance.getEntriesByName('mydrobe:body-sizes-ready').some((entry) => {
          const templates = ((entry as PerformanceMark).detail as { templates?: string[] } | null)?.templates ?? []
          return templates.includes('shirt-long-sleeve') && templates.includes('trousers-straight')
        }),
      ),
    )
    .toBe(true)
  const built = await geometryBuilds(page)

  for (const size of ['Large', 'Small', 'Medium'] as const) {
    await preset(page, size).click()
    await nextFrames(page)
  }
  expect(await geometryBuilds(page), 'shapes worked out while switching').toBe(built)
})
