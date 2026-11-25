import type { Page } from '@playwright/test'
import { garmentCard, openFittingRoom, preset } from './support/fitting-room.ts'
import { nextFrames } from './support/marks.ts'
import { expect, test } from './support/test.ts'

/*
 * A demo fabric's flecks are tens of thousands of tiny rectangles. Drawing them
 * all again for every body size kept the page and the graphics card busy. A
 * new size only needs what changes with the body: the seams, buttons and creases.
 */

type Counted = Window & { __fillRects?: number }

const fillRects = (page: Page) => page.evaluate(() => (window as Counted).__fillRects ?? 0)

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
