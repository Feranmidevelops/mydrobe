import type { Page } from '@playwright/test'
import type { GarmentRecord } from '../src/lib/db.ts'
import { alertWith, currentOutfit, garmentCard, seedGarments, stageCanvas, storageReady } from './support/fitting-room.ts'
import { fitFailures, pageNow, waitForFitted } from './support/marks.ts'
import { expect, test } from './support/test.ts'

/** Wears a demo shirt and saves it as "Look 1". */
async function saveAnOutfit(page: Page) {
  await garmentCard(page, 'Oxford stripe shirt').click()
  await expect(garmentCard(page, 'Oxford stripe shirt')).toHaveAttribute('aria-pressed', 'true')
  const outfit = currentOutfit(page)
  await outfit.getByRole('button', { name: 'Save outfit' }).click()
  await outfit.getByRole('button', { name: 'Save', exact: true }).click()
  return outfit
}

test.describe("when the browser won't let Mydrobe save", () => {
  test.beforeEach(({ page }) =>
    page.addInitScript(() => {
      // What private windows and locked-down browsers can do.
      IDBFactory.prototype.open = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      }
    }),
  )

  test('it says so, saving works for the visit, and nothing comes back after a reload', async ({ page }) => {
    await page.goto('/fitting-room')
    await expect(page.getByRole('note').filter({ hasText: "This browser isn't letting Mydrobe save" })).toBeVisible()
    await expect(storageReady(page)).toBeHidden()

    const outfit = await saveAnOutfit(page)
    await expect(outfit.getByText('Saved as “Look 1”')).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Outfits 1/ })).toBeVisible()

    await page.reload() // the init script applies again
    await page.getByRole('tab', { name: /^Outfits/ }).click()
    await expect(page.getByText('No saved outfits yet')).toBeVisible()
  })
})

test('says when the device is out of space, instead of claiming the outfit was saved', async ({ page }) => {
  await page.addInitScript(() => {
    // Writes start failing only when the test says so, once the saved wardrobe has loaded.
    const failing = window as Window & { failWrites?: boolean }
    for (const method of ['put', 'add'] as const) {
      const original = IDBObjectStore.prototype[method]
      IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
        if (failing.failWrites) throw new DOMException('Disk full', 'QuotaExceededError')
        return original.apply(this, args)
      }
    }
  })
  await page.goto('/fitting-room')
  await expect(storageReady(page)).toBeVisible()
  await page.evaluate(() => {
    ;(window as Window & { failWrites?: boolean }).failWrites = true
  })

  const outfit = await saveAnOutfit(page)
  await expect(alertWith(page, "There isn't enough space on this device")).toBeVisible()
  await expect(outfit.getByText('Saved as “Look 1”')).toHaveCount(0)
})

test('a saved photo that no longer opens is shown in plain colour, with a note saying why', async ({ page }) => {
  const now = Date.now()
  const broken = {
    id: 'e2e-broken-photo',
    name: 'Broken photo shirt',
    category: 'shirt',
    templateId: 'shirt-long-sleeve',
    tags: [],
    createdAt: now,
    updatedAt: now,
    imageKey: 'e2e-broken-photo-image',
    mimeType: 'image/jpeg',
    fileSize: 4,
  } satisfies GarmentRecord

  await page.goto('/fitting-room')
  await expect(storageReady(page)).toBeVisible()
  await seedGarments(page, [{ record: broken, photo: Buffer.from([0xde, 0xad, 0xbe, 0xef]) }])
  await page.reload()
  await expect(storageReady(page)).toBeVisible()
  await expect(stageCanvas(page)).toBeVisible()

  const since = await pageNow(page)
  await garmentCard(page, 'Broken photo shirt').click()
  await waitForFitted(page, since)
  expect(await fitFailures(page, since)).toBe(1)
  await expect(page.getByText("Broken photo shirt couldn't be fitted from its photo, so it shows in plain colour.")).toBeVisible()
  await expect(garmentCard(page, 'Broken photo shirt')).toHaveAttribute('aria-pressed', 'true')
})

test('shows the 3D figure as the finished mannequin, with no placeholder label', async ({ page }) => {
  await page.goto('/fitting-room')
  await expect(stageCanvas(page)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fitting room' }).getByText(/placeholder/i)).toHaveCount(0)
})
