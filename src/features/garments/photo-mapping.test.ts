import { describe, expect, it } from 'vitest'
import {
  averageColor,
  coverage,
  cropAndFill,
  erodeMask,
  estimateBackground,
  frontCrop,
  garmentMask,
  largestComponent,
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

function colorAt(image: RgbaImage, x: number, y: number): Rgb {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
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

describe('largestComponent', () => {
  it('drops props lying apart from the garment', () => {
    const image = shirtPhoto()
    paint(image, { x: 92, y: 2, width: 6, height: 6 }, NAVY)
    const mask = largestComponent(garmentMask(image, WHITE), 100, 100)
    expect(maskBounds(mask, 100, 100)).toEqual({ x: 10, y: 20, width: 80, height: 70 })
    expect(mask[3 * 100 + 94]).toBe(0)
  })

  it('returns an empty mask when there is no garment', () => {
    expect(largestComponent(new Uint8Array(16), 4, 4).every((value) => value === 0)).toBe(true)
  })
})

describe('erodeMask', () => {
  it('shaves the given number of pixels off every side', () => {
    const image = blank(20, 20)
    paint(image, { x: 4, y: 5, width: 10, height: 8 }, NAVY)
    const eroded = erodeMask(garmentMask(image, WHITE), 20, 20, 2)
    expect(maskBounds(eroded, 20, 20)).toEqual({ x: 6, y: 7, width: 6, height: 4 })
  })

  it('removes specks smaller than the radius and treats the image edge as background', () => {
    const image = blank(10, 10)
    paint(image, { x: 0, y: 0, width: 10, height: 1 }, NAVY)
    paint(image, { x: 5, y: 5, width: 1, height: 1 }, NAVY)
    expect(maskBounds(erodeMask(garmentMask(image, WHITE), 10, 10, 1), 10, 10)).toBeNull()
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

  it('samples the left leg of a pair of trousers', () => {
    const { mask, bounds } = analyse(trousersPhoto())
    const swatch = swatchRect('trousers-straight', bounds)
    expect(coverage(mask, 100, swatch)).toBe(1)
  })
})

describe('filling the background inside the crop', () => {
  it('paints the gap between trouser legs with the fabric colour', () => {
    const image = trousersPhoto()
    const { mask, bounds } = analyse(image)
    const fabric = averageColor(image, mask, bounds)
    const filled = cropAndFill(image, mask, bounds, fabric)

    expect(fabric).toEqual(NAVY)
    expect(colorAt(filled, 25 - bounds.x + 25, 60 - bounds.y)).toEqual(NAVY)
    expect(colorAt(filled, 0, 0)).toEqual(NAVY)
  })

  it('can carry a fabric pattern through the gap instead of a flat colour', () => {
    const image = trousersPhoto()
    const { mask, bounds } = analyse(image)
    const swatch = blank(2, 1)
    paint(swatch, { x: 1, y: 0, width: 1, height: 1 }, [200, 40, 40])
    const filled = cropAndFill(image, mask, bounds, swatch)

    // Columns in the gap alternate between the swatch's two pixels, mirrored.
    const gapRow = 60 - bounds.y
    const gapColumns = [47, 48, 49, 50].map((x) => colorAt(filled, x - bounds.x, gapRow))
    expect(gapColumns).toEqual([
      [200, 40, 40],
      [200, 40, 40],
      WHITE,
      WHITE,
    ])
  })

  it('reports how much of the crop is garment', () => {
    const { mask, bounds } = analyse(trousersPhoto())
    expect(coverage(mask, 100, bounds)).toBeCloseTo((40 * 15 + 2 * 17 * 65) / (40 * 80), 5)
  })
})
