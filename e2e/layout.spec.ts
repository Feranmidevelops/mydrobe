import type { Page } from '@playwright/test'
import { PHOTOS } from './fixtures/photos.ts'
import { stage, storageReady, wardrobe } from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'

/*
 * Where the stage and wardrobe sit at phone, landscape and desktop sizes.
 * Numbers are CSS px; boxes are checked to within a pixel.
 */

interface Box {
  x: number
  y: number
  width: number
  height?: number
}

const PHONE = { isMobile: true, hasTouch: true }
const HINT = /^Drag to rotate/

async function openFittingRoom(page: Page) {
  await page.goto('/fitting-room')
  await expect(storageReady(page)).toBeVisible()
}

async function expectBox(locator: ReturnType<Page['locator']>, expected: Box) {
  const box = await locator.boundingBox()
  expect(box, 'on screen').not.toBeNull()
  for (const key of Object.keys(expected) as (keyof Box)[]) {
    expect(Math.abs(box![key] - expected[key]!), `${key}: ${box![key]} against ${expected[key]}`).toBeLessThanOrEqual(1)
  }
}

/** Nothing on the page is wider than the screen, so it never scrolls sideways. */
async function expectNoSidewaysScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBe(innerWidth)
}

const LAYOUTS = [
  {
    name: 'a phone held upright',
    use: { viewport: { width: 390, height: 844 }, ...PHONE },
    // The stage takes the top half and stays there while the wardrobe scrolls under it.
    stage: { x: 0, y: 0, width: 390, height: 422 },
    position: 'sticky',
    wardrobe: { x: 0, y: 422, width: 390 },
    // A card scrolled into view stops below the stage instead of behind it.
    scrollPaddingTop: '434px',
    hint: null,
  },
  {
    name: 'a phone held sideways',
    use: { viewport: { width: 844, height: 390 }, ...PHONE },
    stage: { x: 0, y: 0, width: 424, height: 390 },
    position: 'relative',
    wardrobe: { x: 424, y: 0, width: 420, height: 390 },
    scrollPaddingTop: '0px',
    hint: 'Drag to rotate · pinch to zoom',
  },
  {
    name: 'a desktop window',
    use: { viewport: { width: 1280, height: 800 } },
    stage: { x: 0, y: 0, width: 860, height: 800 },
    position: 'relative',
    wardrobe: { x: 860, y: 0, width: 420, height: 800 },
    scrollPaddingTop: '0px',
    hint: 'Drag to rotate · scroll to zoom',
  },
] as const

for (const layout of LAYOUTS) {
  test.describe(`on ${layout.name}`, () => {
    test.use(layout.use)

    test('the stage and wardrobe sit where they should, and nothing scrolls sideways', async ({ page }) => {
      await openFittingRoom(page)
      await expectBox(stage(page), layout.stage)
      await expect(stage(page)).toHaveCSS('position', layout.position)
      await expectBox(wardrobe(page), layout.wardrobe)
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop)).toBe(
        layout.scrollPaddingTop,
      )
      const hints = stage(page).getByText(HINT).filter({ visible: true })
      if (layout.hint) await expect(hints).toHaveText([layout.hint])
      else await expect(hints).toHaveCount(0)
      await expectNoSidewaysScroll(page)
    })
  })
}

// Half the screen, but never under 280 px.
for (const { viewport, height } of [
  { viewport: { width: 320, height: 568 }, height: 284 },
  { viewport: { width: 375, height: 500 }, height: 280 },
  { viewport: { width: 280, height: 653 }, height: 326.5 },
]) {
  test.describe(`on a ${viewport.width}×${viewport.height} phone`, () => {
    test.use({ viewport, ...PHONE })

    test(`the stage is ${height} px tall and nothing scrolls sideways`, async ({ page }) => {
      await openFittingRoom(page)
      await expectBox(stage(page), { x: 0, y: 0, width: viewport.width, height })
      await expectNoSidewaysScroll(page)
    })
  })
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test.describe(`adding clothes on a ${viewport.width}×${viewport.height} phone`, () => {
    test.use({ viewport, ...PHONE })

    test('the upload dialog fits the screen and Add to wardrobe can be reached', async ({ page }) => {
      await openFittingRoom(page)
      await page.getByRole('button', { name: /^Add clothes/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Add clothes' })
      await dialog.getByLabel('Choose a photo').setInputFiles(PHOTOS.shirt)
      await expect(dialog.getByRole('heading', { name: 'Check how it came out' })).toBeVisible()

      const box = await dialog.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      const add = dialog.getByRole('button', { name: 'Add to wardrobe' })
      await expect(add).toBeEnabled()
      await add.scrollIntoViewIfNeeded()
      await expect(add).toBeInViewport()
      await expectNoSidewaysScroll(page)
    })
  })
}

test.describe('turning a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, ...PHONE })

  test('puts the wardrobe beside the stage when sideways, and back under it when upright', async ({ page }) => {
    await openFittingRoom(page)
    await page.setViewportSize({ width: 844, height: 390 })
    await expectBox(wardrobe(page), { x: 424, y: 0, width: 420, height: 390 })
    await expect(stage(page)).toHaveCSS('position', 'relative')

    await page.setViewportSize({ width: 390, height: 844 })
    await expectBox(stage(page), { x: 0, y: 0, width: 390, height: 422 })
    await expect(stage(page)).toHaveCSS('position', 'sticky')
    await expectNoSidewaysScroll(page)
  })
})
