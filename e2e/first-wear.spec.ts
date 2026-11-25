import type { Page } from '@playwright/test'
import type { MydrobePerfProbe } from '../src/lib/perf.ts'
import { PHOTOS } from './fixtures/photos.ts'
import { garmentCard, openFittingRoom, photoGarment, seedGarments, storageReady } from './support/fitting-room.ts'
import { nextFrames, pageNow } from './support/marks.ts'
import { expect, test } from './support/test.ts'

/*
 * The graphics card has to compile a shader before it can draw a garment, and
 * doing that on the spot held up the first piece worn for about a tenth of a
 * second. The fitting room compiles them ahead, while it stands idle. The ?perf
 * probe counts the shader programs the renderer holds.
 */

type Probed = Window & { __MYDROBE_PERF__?: MydrobePerfProbe }

const programs = (page: Page) => page.evaluate(() => (window as Probed).__MYDROBE_PERF__!.renderer().programs)

test('putting on the first pieces never waits for a shader to compile', async ({ page }) => {
  await page.goto('/fitting-room')
  await expect(storageReady(page)).toBeVisible()
  await seedGarments(page, [photoGarment('Saved red shirt', PHOTOS.shirt, 'shirt', '#b3261e')])
  await openFittingRoom(page, '/fitting-room?perf')
  await expect.poll(() => page.evaluate(() => (window as Probed).__MYDROBE_PERF__ !== undefined)).toBe(true)
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('mydrobe:shaders-ready').length)).toBe(1)
  const ready = await programs(page)

  // A demo piece is drawn in its fabric at once. A photo piece shows in plain colour while
  // its photo is fitted, then in the fabric's shader too, so it needn't be waited for.
  await garmentCard(page, 'Indigo denim').click()
  const since = await pageNow(page)
  await garmentCard(page, 'Saved red shirt').click()
  await expect
    .poll(() => page.evaluate((since) => performance.getEntriesByName('mydrobe:fit-start').some((entry) => entry.startTime >= since), since))
    .toBe(true)
  await nextFrames(page)
  expect(await programs(page), 'shaders compiled on the spot').toBe(ready)
})
