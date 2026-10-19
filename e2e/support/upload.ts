import { expect, type Page } from '@playwright/test'
import { statusWith } from './fitting-room.ts'

const WARNINGS = /cut off at the edge|quite small in the photo|background may show on the mannequin/

export interface ClothesToAdd {
  photo: { name: string; mimeType: string; buffer: Buffer }
  /** Left as Shirt unless given. */
  category?: 'Trousers'
  /** Left as Long unless given. */
  sleeves?: 'Long' | 'Short'
  /** The name the review step should suggest. */
  suggested: string
  /** The name to give it instead. */
  name: string
}

/** Adds a garment through the real upload dialog, the way a person would. */
export async function addClothes(page: Page, clothes: ClothesToAdd) {
  // The card's accessible name is "Add clothes From a photo".
  await page.getByRole('button', { name: /^Add clothes/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Add clothes' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Choose a photo').setInputFiles(clothes.photo)
  await expect(dialog.getByRole('heading', { name: 'Check how it came out' })).toBeVisible()

  // The radios are visually hidden inside their labels, so click the label text.
  if (clothes.category) {
    await dialog.getByRole('group', { name: 'What is it?' }).getByText(clothes.category, { exact: true }).click()
    await expect(dialog.getByRole('radio', { name: clothes.category, exact: true })).toBeChecked()
  }
  if (clothes.sleeves) {
    await dialog.getByRole('group', { name: 'Sleeves' }).getByText(clothes.sleeves, { exact: true }).click()
    await expect(dialog.getByRole('radio', { name: clothes.sleeves, exact: true })).toBeChecked()
  }

  // Each choice analyses the photo again, and "Add to wardrobe" waits until that's done.
  const add = dialog.getByRole('button', { name: 'Add to wardrobe' })
  await expect(add).toBeEnabled()
  await expect(dialog.getByText('Finding the garment…')).toHaveCount(0)
  await expect(dialog.getByText(WARNINGS)).toHaveCount(0)
  await expect(dialog.getByRole('img', { name: /^Your photo with the background faded/ })).toBeVisible()
  const nameField = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await expect(nameField).toHaveValue(clothes.suggested)
  await nameField.fill(clothes.name)
  await add.click()

  // The dialog closes by unmounting; never wait on the browser's close event.
  await expect(dialog).toBeHidden()
  const toast = statusWith(page, `${clothes.name} added to your wardrobe`)
  await expect(toast).toBeVisible()
  // It goes by itself after 4 s, but it covers the bottom of the stage until then.
  await toast
    .getByRole('button', { name: 'Dismiss' })
    .click({ timeout: 1_000 })
    .catch(() => {})
  await expect(toast).toBeHidden({ timeout: 6_000 })
}
