import type { Page } from '@playwright/test'
import type { MydrobePerfProbe } from '../src/lib/perf.ts'
import { garmentCard, openFittingRoom, preset } from './support/fitting-room.ts'
import { nextFrames } from './support/marks.ts'
import { expect, test } from './support/test.ts'

/*
 * Changing body size or clothes must give back what the 3D view held for the
 * last look. The ?perf probe reads the renderer's own counts of the textures
 * and geometries it holds on the GPU.
 */

type Probed = Window & { __MYDROBE_PERF__?: MydrobePerfProbe }

const held = (page: Page) =>
  page.evaluate(() => {
    const { textures, geometries } = (window as Probed).__MYDROBE_PERF__!.renderer()
    return { textures, geometries }
  })

/** Switches through every body size and swaps both pieces for others and back, as someone trying looks would. */
async function tryLooks(page: Page) {
  for (const size of ['Large', 'Small', 'Medium'] as const) {
    await preset(page, size).click()
    await nextFrames(page)
  }
  for (const piece of ['Navy gingham shirt', 'Black tailored trousers', 'Oxford stripe shirt', 'Indigo denim']) {
    await garmentCard(page, piece).click()
    await nextFrames(page)
  }
}

test('trying looks gives back the GPU memory each look held', async ({ page }) => {
  await openFittingRoom(page, '/fitting-room?perf')
  await expect.poll(() => page.evaluate(() => (window as Probed).__MYDROBE_PERF__ !== undefined)).toBe(true)
  await garmentCard(page, 'Oxford stripe shirt').click()
  await garmentCard(page, 'Indigo denim').click()
  await nextFrames(page)

  // A first round fills anything kept on purpose; a second, identical round must hold no more.
  await tryLooks(page)
  const before = await held(page)
  await tryLooks(page)
  expect(await held(page)).toEqual(before)
})
