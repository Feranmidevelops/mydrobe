import type { Page } from '@playwright/test'
import { nextFrames } from './marks.ts'

/*
 * Real touch input through the Chrome DevTools Protocol. It takes the same
 * path as a finger on a phone: touch events, pointer events, and the
 * browser's own scrolling. Chromium only.
 */

export interface Point {
  x: number
  y: number
}

type Send = (type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: Point[]) => Promise<void>

async function withTouch(page: Page, gesture: (send: Send) => Promise<void>) {
  const session = await page.context().newCDPSession(page)
  try {
    await gesture(async (type, fingers) => {
      const touchPoints = fingers.map(({ x, y }, id) => ({ x, y, id }))
      await session.send('Input.dispatchTouchEvent', { type, touchPoints })
    })
  } finally {
    await session.detach()
  }
}

/** One finger from `from`, moved by (dx, dy) in `steps` moves, with frames drawn between them. */
export function touchDrag(page: Page, from: Point, dx: number, dy = 0, steps = 24) {
  return withTouch(page, async (send) => {
    await send('touchStart', [from])
    for (let i = 1; i <= steps; i++) {
      await send('touchMove', [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }])
      await nextFrames(page)
    }
    await send('touchEnd', [])
  })
}

/** Two fingers either side of `centre`, moved from `fromGap` to `toGap` px apart. */
export function pinch(page: Page, centre: Point, fromGap: number, toGap: number, steps = 24) {
  const fingers = (gap: number) => [
    { x: centre.x - gap / 2, y: centre.y },
    { x: centre.x + gap / 2, y: centre.y },
  ]
  return withTouch(page, async (send) => {
    await send('touchStart', fingers(fromGap))
    for (let i = 1; i <= steps; i++) {
      await send('touchMove', fingers(fromGap + ((toGap - fromGap) * i) / steps))
      await nextFrames(page)
    }
    await send('touchEnd', [])
  })
}
