import type { Page } from '@playwright/test'
import { garmentCard, openFittingRoom, stage, stageCanvas } from './support/fitting-room.ts'
import { changedShare, FIGURE, homeRegion, settledStageShot } from './support/stage.ts'
import { expect, test } from './support/test.ts'
import { pinch, touchDrag } from './support/touch.ts'

// Runs in the phone project: a 390×844 touch screen.
test.skip(({ browserName }) => browserName !== 'chromium', 'touch input goes through the Chrome DevTools Protocol')

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

async function canvasCentre(page: Page) {
  const box = await stageCanvas(page).boundingBox()
  if (!box) throw new Error('The 3D canvas is not on screen')
  return { box, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
}

test('a phone gets the touch layout, and a tap picks a piece', async ({ page }) => {
  await openFittingRoom(page)
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  await expect(stage(page)).toHaveCSS('position', 'sticky')

  const trousers = garmentCard(page, 'Black tailored trousers')
  await trousers.tap()
  await expect(trousers).toHaveAttribute('aria-pressed', 'true')
})

test('a card scrolled into view stops below the pinned stage, not behind it', async ({ page }) => {
  await openFittingRoom(page)
  const card = garmentCard(page, 'Camel wool overcoat')
  await card.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThanOrEqual(433)
  expect(await scrollY(page)).toBeGreaterThan(0)
  expect((await stage(page).boundingBox())!.y).toBe(0)
})

test('one finger turns the mannequin a full circle, and the page stays still', async ({ page }) => {
  await openFittingRoom(page)
  const home = await settledStageShot(page)
  const figure = homeRegion(home, FIGURE)
  const { box, centre } = await canvasCentre(page)

  await touchDrag(page, centre, box.height / 4)
  const turned = await settledStageShot(page)
  expect(changedShare(home, turned, figure)).toBeGreaterThan(0.05)
  // The stage takes touches for itself (touch-action: none), so the page doesn't scroll.
  expect(await scrollY(page)).toBe(0)

  // The rest of the way round brings it back to where it started: there's no limit on turning.
  await touchDrag(page, centre, (box.height * 3) / 4, 0, 48)
  expect(changedShare(home, await settledStageShot(page), figure)).toBeLessThan(0.02)
})

test('a drag that starts level with the body size buttons, off to one side, still turns the mannequin', async ({
  page,
}) => {
  await openFittingRoom(page)
  const home = await settledStageShot(page)
  const { box } = await canvasCentre(page)
  const presets = await stage(page).getByRole('radiogroup', { name: 'Body preset' }).boundingBox()
  // The row the buttons sit in spans the whole stage, but only the buttons should take touches.
  await touchDrag(page, { x: box.x + 20, y: presets!.y + presets!.height / 2 }, box.height / 4)
  expect(changedShare(home, await settledStageShot(page), homeRegion(home, FIGURE))).toBeGreaterThan(0.05)
})

test('two fingers zoom, and the page stays still', async ({ page }) => {
  await openFittingRoom(page)
  const home = await settledStageShot(page)
  const { centre } = await canvasCentre(page)

  await pinch(page, centre, 60, 220)
  const zoomed = await settledStageShot(page)
  expect(changedShare(home, zoomed, homeRegion(home, FIGURE))).toBeGreaterThan(0.05)
  expect(await scrollY(page)).toBe(0)
})

test('a swipe on the wardrobe scrolls the page, and the stage stays pinned at the top', async ({ page }) => {
  await openFittingRoom(page)
  await touchDrag(page, { x: 195, y: 780 }, 0, -300, 12)
  await expect.poll(() => scrollY(page)).toBeGreaterThan(100)
  expect((await stage(page).boundingBox())!.y).toBe(0)
})
