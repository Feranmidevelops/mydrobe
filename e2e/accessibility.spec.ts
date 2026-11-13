import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { PHOTOS } from './fixtures/photos.ts'
import { openFittingRoom } from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'
import { waitForAnalysis } from './support/upload.ts'

/*
 * An automated accessibility check of each page and the upload dialog, with
 * axe against WCAG 2.1 A and AA. It catches what a machine can (missing
 * names and labels, contrast, roles used wrongly), not everything: keyboard
 * use and screen reader wording still need a person.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** What axe finds, as one line per rule and element so a failure says where to look. */
async function problems(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG)
  const { violations } = await (include ? builder.include(include) : builder).analyze()
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} (${violation.impact}): ${violation.help}, at ${node.target.join(' ')}: ${node.html.slice(0, 160)}`,
    ),
  )
}

test('the landing page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await problems(page)).toEqual([])
})

test('the fitting room', async ({ page }) => {
  await openFittingRoom(page)
  expect(await problems(page)).toEqual([])
})

test('the privacy page', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await problems(page)).toEqual([])
})

test('the upload dialog, choosing a photo and checking how it came out', async ({ page }) => {
  await openFittingRoom(page)
  await page.getByRole('button', { name: /^Add clothes/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Add clothes' })
  await expect(dialog).toBeVisible()
  expect(await problems(page, 'dialog')).toEqual([])

  await dialog.getByLabel('Choose a photo').setInputFiles(PHOTOS.shirt)
  await waitForAnalysis(dialog)
  expect(await problems(page, 'dialog')).toEqual([])
})
