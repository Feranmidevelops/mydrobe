import type { Page } from '@playwright/test'
import { PHOTOS } from './fixtures/photos.ts'
import { openFittingRoom } from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'

/** Opens the upload dialog and returns it. */
async function openUpload(page: Page) {
  await openFittingRoom(page)
  await page.getByRole('button', { name: /^Add clothes/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Add clothes' })
  await expect(dialog).toBeVisible()
  return dialog
}

test('turns away a photo too small to use', async ({ page }) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Choose a photo').setInputFiles(PHOTOS.tiny)
  await expect(dialog.getByRole('alert')).toHaveText(
    'That photo is too small to use. It needs to be at least 300 pixels on its shortest side.',
  )
  // The person can try again straight away.
  await expect(dialog.getByLabel('Choose a photo')).toBeFocused()
})

test('turns away a file that only pretends to be a photo', async ({ page }) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Choose a photo').setInputFiles(PHOTOS.notAPhoto)
  await expect(dialog.getByRole('alert')).toHaveText("That file isn't a photo we can use. Choose a JPEG, PNG or WebP image.")
})

test('warns when a shirt is called trousers, and names a short-sleeved shirt a tee', async ({ page }) => {
  const dialog = await openUpload(page)
  await dialog.getByLabel('Choose a photo').setInputFiles(PHOTOS.shirt)
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toHaveValue('Red shirt')

  await dialog.getByRole('group', { name: 'Sleeves' }).getByText('Short', { exact: true }).click()
  await expect(name).toHaveValue('Red tee')

  await dialog.getByRole('group', { name: 'What is it?' }).getByText('Trousers', { exact: true }).click()
  await expect(dialog.getByText(/background may show on the mannequin/)).toBeVisible()
})

test('accepts a photo dropped onto the dialog', async ({ page }) => {
  const dialog = await openUpload(page)
  const dataTransfer = await page.evaluateHandle(
    ({ base64, name, type }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name, { type }))
      return transfer
    },
    { base64: PHOTOS.shirt.buffer.toString('base64'), name: PHOTOS.shirt.name, type: PHOTOS.shirt.mimeType },
  )
  await dialog.getByRole('group', { name: 'Add a photo' }).dispatchEvent('drop', { dataTransfer })
  await expect(dialog.getByRole('heading', { name: 'Check how it came out' })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Red shirt')
})
