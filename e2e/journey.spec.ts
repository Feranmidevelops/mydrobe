import { EXPECTED } from './fixtures/garment-photos.ts'
import { PHOTOS } from './fixtures/photos.ts'
import {
  cameraButton,
  currentOutfit,
  garmentCard,
  preset,
  resetCamera,
  savedCounts,
  stageCanvas,
  statusWith,
  storageReady,
} from './support/fitting-room.ts'
import { fitFailures, pageNow, waitForFirstFrame, waitForFitted } from './support/marks.ts'
import {
  changedShare,
  dragStage,
  FIGURE,
  garmentWidth,
  homeRegion,
  HUE,
  hueCount,
  hueShare,
  LEGS,
  settledStageShot,
  TORSO,
} from './support/stage.ts'
import { expect, test } from './support/test.ts'
import { addClothes } from './support/upload.ts'

const SHIRT = EXPECTED.shirt
const TROUSERS = EXPECTED.trousers
/** Records a measurement in the report, to calibrate limits and see trends. */
const note = (type: string, value: unknown) => test.info().annotations.push({ type, description: JSON.stringify(value) })

/*
 * The blueprint's definition of done, end to end in a real browser: open the
 * app, upload a shirt and trousers, put an outfit together, turn a genuine 3D
 * mannequin, switch body shapes, save, reload and wear the outfit again.
 */
test('upload a shirt and trousers, dress, turn, resize, save, reload and wear it again', async ({ page, baseURL }) => {
  // Two uploads analysed in the worker, three body shapes and a reload, all on SwiftShader:
  // about 2 minutes alone, and up to 3 with another test running alongside.
  test.setTimeout(5 * 60_000)
  const outfit = currentOutfit(page)

  // Photos and outfits must never leave the device.
  const offDevice: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(baseURL!) && !url.startsWith('blob:') && !url.startsWith('data:')) offDevice.push(url)
  })

  await test.step('enter the fitting room from the landing page', async () => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Enter the fitting room' }).click()
    await expect(page).toHaveURL(/\/fitting-room$/)
    await expect(page).toHaveTitle('Fitting room · Mydrobe')
    await expect(storageReady(page)).toBeVisible()
    await expect(stageCanvas(page)).toBeVisible()
    await waitForFirstFrame(page)
  })
  const bare = await settledStageShot(page)
  expect(hueCount(bare, homeRegion(bare, FIGURE), HUE.red)).toBeLessThan(5)

  await test.step('upload a shirt, which goes straight onto the mannequin', async () => {
    const since = await pageNow(page)
    await addClothes(page, { photo: PHOTOS.shirt, suggested: SHIRT.suggested, name: SHIRT.name })
    await expect(outfit.getByRole('button', { name: `Take off ${SHIRT.name}` })).toBeVisible()
    await waitForFitted(page, since)
    expect(await fitFailures(page, since)).toBe(0)
    const shot = await settledStageShot(page)
    const measured = {
      torsoRed: hueShare(shot, homeRegion(shot, TORSO), HUE.red),
      pocket: hueCount(shot, homeRegion(shot, FIGURE), HUE.green),
    }
    note('shirt on (torso red share, pocket css px²)', measured)
    expect(measured.torsoRed).toBeGreaterThan(0.5)
    // The green pocket proves the photo itself is mapped, not just its colour.
    expect(measured.pocket).toBeGreaterThan(40)
  })

  await test.step('upload trousers', async () => {
    const since = await pageNow(page)
    await addClothes(page, {
      photo: PHOTOS.trousers,
      category: TROUSERS.chip,
      suggested: TROUSERS.suggested,
      name: TROUSERS.name,
    })
    await expect(outfit.getByRole('button', { name: /^Take off / })).toHaveCount(2)
    await waitForFitted(page, since)
    const shot = await settledStageShot(page)
    const legsBlue = hueShare(shot, homeRegion(shot, LEGS), HUE.blue)
    note('trousers on (legs blue share)', legsBlue)
    expect(legsBlue).toBeGreaterThan(0.3)
  })

  await test.step('take the shirt off and put it back on from the wardrobe', async () => {
    const shirt = garmentCard(page, SHIRT.name)
    await expect(shirt).toHaveAttribute('aria-pressed', 'true')
    await shirt.click()
    await expect(shirt).toHaveAttribute('aria-pressed', 'false')
    await expect(outfit.getByRole('button', { name: `Take off ${SHIRT.name}` })).toHaveCount(0)
    const off = await settledStageShot(page)
    expect(hueShare(off, homeRegion(off, TORSO), HUE.red)).toBeLessThan(0.05)

    const since = await pageNow(page)
    await shirt.click()
    await expect(shirt).toHaveAttribute('aria-pressed', 'true')
    await waitForFitted(page, since)
  })

  await test.step('turn a genuine 3D mannequin', async () => {
    await resetCamera(page).click()
    const home = await settledStageShot(page)
    const figure = homeRegion(home, FIGURE)
    const box = (await stageCanvas(page).boundingBox())!

    // A quarter turn changes the picture...
    await dragStage(page, box.height / 4)
    const turned = await settledStageShot(page)
    expect(changedShare(home, turned, figure)).toBeGreaterThan(0.05)
    // ...and the Front button brings it exactly back: it was the camera that moved.
    await cameraButton(page, 'Front').click()
    const front = await settledStageShot(page)
    const backHome = changedShare(home, front, figure)
    note('front after a quarter turn (changed share)', backHome)
    expect(backHome).toBeLessThan(0.01)

    // A whole turn ends where it began: nothing stops the mannequin going all the way round.
    await dragStage(page, box.height, 0, 48)
    const fullCircle = changedShare(home, await settledStageShot(page), figure)
    note('after a full turn (changed share)', fullCircle)
    expect(fullCircle).toBeLessThan(0.02)

    // From the side a real body is narrower, and from the back the front pocket can't be seen.
    await cameraButton(page, 'Side').click()
    const side = await settledStageShot(page)
    const widths = { front: garmentWidth(front, 1.12, HUE.red), side: garmentWidth(side, 1.12, HUE.red) }
    note('red width front/side (css px)', widths)
    expect(widths.side).toBeLessThan(0.85 * widths.front)
    await cameraButton(page, 'Back').click()
    const back = await settledStageShot(page)
    expect(hueCount(back, figure, HUE.green)).toBeLessThan(5)
    expect(hueShare(back, homeRegion(back, TORSO), HUE.red)).toBeGreaterThan(0.5)

    // Scrolling zooms in.
    await resetCamera(page).click()
    const before = garmentWidth(await settledStageShot(page), 1.12, HUE.red)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -400)
    const zoomed = garmentWidth(await settledStageShot(page), 1.12, HUE.red)
    note('red width before/after zooming in (css px)', { before, zoomed })
    expect(zoomed).toBeGreaterThan(before)
    await resetCamera(page).click()
  })

  await test.step('switch between the three body shapes', async () => {
    const widths = { Small: 0, Medium: 0, Large: 0 }
    for (const name of ['Small', 'Medium', 'Large'] as const) {
      const since = await pageNow(page)
      await preset(page, name).click()
      await expect(preset(page, name)).toBeChecked()
      if (name !== 'Medium') await waitForFitted(page, since, 2) // both photo garments refit the new body
      widths[name] = garmentWidth(await settledStageShot(page), 1.12, HUE.red)
    }
    note('red width per body shape (css px)', widths)
    expect(widths.Small).toBeLessThan(widths.Medium)
    expect(widths.Large).toBeGreaterThan(widths.Medium)
  })

  await test.step('save the outfit', async () => {
    await outfit.getByRole('button', { name: 'Save outfit' }).click()
    const field = outfit.getByRole('textbox', { name: 'Name this outfit' })
    await expect(field).toHaveValue('Look 1')
    await field.fill('Weekend look')
    await outfit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(outfit.getByText('Saved as “Weekend look”')).toBeVisible()
    await expect(statusWith(page, 'Saved “Weekend look”')).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Outfits 1/ })).toBeVisible()
    // On the device before the reload, not just on screen.
    await expect.poll(() => savedCounts(page)).toEqual({ garments: 2, outfits: 1 })
  })

  await test.step('reload and wear the saved outfit again', async () => {
    await page.reload()
    await expect(storageReady(page)).toBeVisible()
    // What's on the mannequin isn't kept between visits; the outfit is.
    await expect(preset(page, 'Medium')).toBeChecked()
    await expect(outfit.getByText('Pick a shirt and trousers from your wardrobe')).toBeVisible()
    await expect(garmentCard(page, SHIRT.name)).toHaveAttribute('aria-pressed', 'false')
    await expect(garmentCard(page, TROUSERS.name)).toBeVisible()
    await waitForFirstFrame(page)

    await page.getByRole('tab', { name: /^Outfits 1/ }).click()
    const saved = page.getByRole('article', { name: 'Weekend look' })
    await expect(saved).toContainText(`${SHIRT.name} · ${TROUSERS.name} · Large`)
    const since = await pageNow(page)
    await saved.getByRole('button', { name: 'Wear', exact: true }).click()
    await expect(saved.getByRole('button', { name: 'Wearing' })).toBeDisabled()
    await expect(preset(page, 'Large')).toBeChecked()
    await expect(outfit.getByRole('button', { name: /^Take off / })).toHaveCount(2)
    // Fresh analyses: the photos came back from the device as new object URLs.
    await waitForFitted(page, since, 2)
    expect(await fitFailures(page, since)).toBe(0)
    await resetCamera(page).click()
    const shot = await settledStageShot(page)
    expect(hueShare(shot, homeRegion(shot, TORSO), HUE.red)).toBeGreaterThan(0.5)
    expect(hueShare(shot, homeRegion(shot, LEGS), HUE.blue)).toBeGreaterThan(0.3)
    expect(hueCount(shot, homeRegion(shot, FIGURE), HUE.green)).toBeGreaterThan(40)
  })

  expect(offDevice, 'requests that left the device').toEqual([])
})
