import { describe, expect, it } from 'vitest'
import {
  estimateBackground,
  frontCrop,
  garmentMask,
  maskBounds,
  swatchRect,
  torsoRect,
  type Rect,
  type RgbaImage,
  type Rgb,
} from './photo-mapping'

const WHITE: Rgb = [255, 255, 255]
const NAVY: Rgb = [36, 55, 94]

function blank(width: number, height: number, color: Rgb = WHITE, opacity = 255): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([...color, opacity], i * 4)
  return { data, width, height }
}

function paint(image: RgbaImage, rect: Rect, color: Rgb) {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      image.data.set([...color, 255], (y * image.width + x) * 4)
    }
  }
}

/** A flat-lay shirt: a body, wide sleeves across the shoulders, cuffs hanging beside the hem. */
function shirtPhoto() {
  const image = blank(100, 100)
  paint(image, { x: 35, y: 20, width: 30, height: 70 }, NAVY)
  paint(image, { x: 10, y: 20, width: 80, height: 20 }, NAVY)
  paint(image, { x: 12, y: 80, width: 9, height: 10 }, NAVY)
  paint(image, { x: 79, y: 80, width: 9, height: 10 }, NAVY)
  return image
}

/** Front-on trousers: a waistband and two legs with a gap between them. */
function trousersPhoto() {
  const image = blank(100, 100)
  paint(image, { x: 30, y: 10, width: 40, height: 15 }, NAVY)
  paint(image, { x: 30, y: 25, width: 17, height: 65 }, NAVY)
  paint(image, { x: 53, y: 25, width: 17, height: 65 }, NAVY)
  return image
}

function analyse(image: RgbaImage) {
  const mask = garmentMask(image, estimateBackground(image))
  return { mask, bounds: maskBounds(mask, image.width, image.height)! }
}

describe('estimateBackground', () => {
  it('reads the colour around the edges, not the garment', () => {
    const image = blank(60, 60, [230, 226, 220])
    paint(image, { x: 10, y: 10, width: 40, height: 40 }, NAVY)
    expect(estimateBackground(image)).toEqual([230, 226, 220])
  })

  it('ignores a garment that touches part of the edge', () => {
    const image = blank(60, 60)
    paint(image, { x: 0, y: 20, width: 30, height: 20 }, NAVY)
    expect(estimateBackground(image)).toEqual(WHITE)
  })
})

describe('garmentMask and maskBounds', () => {
  it('finds the box around the garment', () => {
    const { bounds } = analyse(shirtPhoto())
    expect(bounds).toEqual({ x: 10, y: 20, width: 80, height: 70 })
  })

  it('is not widened by a single stray pixel', () => {
    const image = shirtPhoto()
    paint(image, { x: 2, y: 97, width: 1, height: 1 }, NAVY)
    expect(analyse(image).bounds).toEqual({ x: 10, y: 20, width: 80, height: 70 })
  })

  it('uses transparency in cut-out images, even for a white garment', () => {
    const image = blank(40, 40, WHITE, 0)
    paint(image, { x: 10, y: 5, width: 20, height: 30 }, WHITE)
    expect(estimateBackground(image)).toBeNull()
    const mask = garmentMask(image, estimateBackground(image))
    expect(maskBounds(mask, 40, 40)).toEqual({ x: 10, y: 5, width: 20, height: 30 })
  })

  it('finds nothing in an empty photo', () => {
    const image = blank(30, 30)
    expect(maskBounds(garmentMask(image, WHITE), 30, 30)).toBeNull()
  })
})

describe('front crop', () => {
  it('keeps only the body of a top, leaving the sleeves out', () => {
    const { mask, bounds } = analyse(shirtPhoto())
    expect(torsoRect(mask, 100, bounds)).toEqual({ x: 35, y: 20, width: 30, height: 70 })
    expect(frontCrop('shirt-long-sleeve', mask, 100, bounds)).toEqual(torsoRect(mask, 100, bounds))
  })

  it('takes the whole of a pair of trousers', () => {
    const { mask, bounds } = analyse(trousersPhoto())
    expect(frontCrop('trousers-straight', mask, 100, bounds)).toEqual(bounds)
  })
})

describe('swatchRect', () => {
  it('stays inside the crop and away from the buttons down the middle of a shirt', () => {
    const crop = { x: 35, y: 20, width: 30, height: 70 }
    const swatch = swatchRect('shirt-long-sleeve', crop)
    expect(swatch.x).toBeGreaterThanOrEqual(crop.x)
    expect(swatch.y + swatch.height).toBeLessThanOrEqual(crop.y + crop.height)
    expect(swatch.x + swatch.width).toBeLessThanOrEqual(crop.x + crop.width / 2)
  })
})
