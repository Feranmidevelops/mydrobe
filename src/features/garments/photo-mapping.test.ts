import { describe, expect, it } from 'vitest'
import {
  averageColor,
  backdropVariation,
  chooseSwatch,
  coverage,
  coverNeckOpening,
  cropAndFill,
  erodeMask,
  estimateBackground,
  flattenLighting,
  frontCrop,
  garmentMask,
  largestComponent,
  maskBounds,
  shoulderRow,
  swatchRect,
  tidyMask,
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
  paint(image, { x: 30, y: 25, width: 15, height: 65 }, NAVY)
  paint(image, { x: 55, y: 25, width: 15, height: 65 }, NAVY)
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

  it('follows a backdrop that shades gradually across the photo', () => {
    // Light grey on the left to white on the right: one colour threshold
    // would call the darker side garment.
    const image = blank(100, 100)
    for (let x = 0; x < 100; x++) paint(image, { x, y: 0, width: 1, height: 100 }, [200 + Math.round(x * 0.55), 200 + Math.round(x * 0.55), 200 + Math.round(x * 0.55)])
    paint(image, { x: 40, y: 30, width: 20, height: 40 }, [150, 150, 150])
    expect(maskBounds(garmentMask(image, estimateBackground(image)), 100, 100)).toEqual({ x: 40, y: 30, width: 20, height: 40 })
  })

  it('gives a busy backdrop more slack than a plain one', () => {
    const plain = blank(40, 40, [120, 120, 120])
    const busy = blank(40, 40, [120, 120, 120])
    for (let x = 0; x < 40; x += 2) paint(busy, { x, y: 0, width: 1, height: 40 }, [170, 170, 170])

    expect(backdropVariation(plain, [120, 120, 120])).toEqual({ spread: 0, roughness: 0 })
    const variation = backdropVariation(busy, estimateBackground(busy)!)
    expect(variation.spread).toBeGreaterThan(100)
    expect(variation.roughness).toBeGreaterThan(100)
  })

  it('separates a garment from a mottled backdrop', () => {
    // A backdrop of light and dark speckles, like concrete, around a white garment.
    const image = blank(80, 80, [60, 60, 60])
    for (let y = 0; y < 80; y += 3) {
      for (let x = (y / 3) % 2; x < 80; x += 4) paint(image, { x, y, width: 2, height: 2 }, [130, 130, 130])
    }
    paint(image, { x: 25, y: 20, width: 30, height: 40 }, [235, 236, 240])
    expect(maskBounds(garmentMask(image, estimateBackground(image)), 80, 80)).toEqual({ x: 25, y: 20, width: 30, height: 40 })
  })

  it('counts backdrop-coloured areas the garment encloses as garment', () => {
    const image = blank(60, 60)
    paint(image, { x: 10, y: 10, width: 40, height: 40 }, NAVY)
    paint(image, { x: 20, y: 20, width: 10, height: 10 }, WHITE)
    const mask = garmentMask(image, WHITE)
    expect(mask[25 * 60 + 25]).toBe(1)
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

describe('tidyMask', () => {
  it('drops a thin hanger rail attached to the garment', () => {
    const image = blank(200, 200)
    paint(image, { x: 60, y: 40, width: 80, height: 140 }, NAVY)
    paint(image, { x: 140, y: 50, width: 60, height: 3 }, NAVY)
    expect(maskBounds(garmentMask(image, WHITE), 200, 200)).toEqual({ x: 60, y: 40, width: 80, height: 140 })
  })

  it('fills notches along the hem, like dark checks lost to a dark backdrop', () => {
    const image = blank(200, 200)
    paint(image, { x: 60, y: 40, width: 80, height: 140 }, NAVY)
    for (let x = 68; x < 132; x += 16) paint(image, { x, y: 172, width: 8, height: 8 }, WHITE)
    const mask = tidyMask(garmentMask(image, WHITE), 200, 200)
    expect(mask[176 * 200 + 72]).toBe(1)
    expect(torsoRect(mask, 200, maskBounds(mask, 200, 200)!).width).toBe(80)
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

  it('starts at the collar of a top on a hanger, leaving the hanger out', () => {
    // A tee hanging from a solid hanger that widens from the hook down to the collar.
    const image = blank(200, 260)
    for (let y = 20; y < 50; y++) paint(image, { x: 100 - (y - 10), y, width: 2 * (y - 10), height: 1 }, NAVY)
    paint(image, { x: 75, y: 50, width: 50, height: 12 }, NAVY) // collar, above the shoulders
    paint(image, { x: 30, y: 62, width: 140, height: 50 }, NAVY) // shoulders and sleeves
    paint(image, { x: 50, y: 62, width: 100, height: 178 }, NAVY) // body
    const { mask, bounds } = analyse(image)
    expect(bounds.y).toBe(20)

    const crop = frontCrop('shirt-short-sleeve', mask, 200, bounds)
    expect(shoulderRow(mask, 200, bounds, 100)).toBe(62)
    expect(crop).toEqual({ x: 50, y: 48, width: 100, height: 192 })
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

describe('chooseSwatch', () => {
  it('samples plain fabric, steering clear of a print', () => {
    // A navy tee with a big white print low on the left, where a fixed spot would sample.
    const image = blank(200, 200)
    paint(image, { x: 50, y: 30, width: 100, height: 150 }, NAVY)
    paint(image, { x: 55, y: 105, width: 40, height: 45 }, [240, 240, 240])
    const mask = garmentMask(image, WHITE)
    const crop = { x: 50, y: 30, width: 100, height: 150 }
    const swatch = chooseSwatch('shirt-short-sleeve', image, mask, crop)
    expect(averageColor(image, mask, swatch)).toEqual(NAVY)
  })
})

describe('flattenLighting', () => {
  it('evens out a shadow falling across the sample', () => {
    const image = blank(40, 40)
    for (let x = 0; x < 40; x++) paint(image, { x, y: 0, width: 1, height: 40 }, [100 + x * 3, 60 + x * 2, 40 + x])
    const flat = flattenLighting(image)
    const spread = (pixels: RgbaImage) => colorAt(pixels, 30, 20)[0] - colorAt(pixels, 10, 20)[0]
    expect(Math.abs(spread(flat))).toBeLessThan(spread(image) / 3)
  })
})

describe('coverNeckOpening', () => {
  const CREAM: Rgb = [236, 232, 224]

  it('paints over a hanger and a label above the shoulders, and leaves the chest alone', () => {
    const front = blank(60, 80, CREAM)
    paint(front, { x: 20, y: 0, width: 20, height: 6 }, [150, 100, 60])
    paint(front, { x: 26, y: 6, width: 8, height: 4 }, NAVY)
    paint(front, { x: 10, y: 50, width: 10, height: 10 }, NAVY)
    const covered = coverNeckOpening(front, 12, blank(16, 16, CREAM), CREAM)

    expect(colorAt(covered, 30, 2)).toEqual(CREAM)
    expect(colorAt(covered, 30, 8)).toEqual(CREAM)
    expect(colorAt(covered, 15, 55)).toEqual(NAVY)
  })

  it('keeps colours the fabric has itself, like the dark lines of a check', () => {
    const RED: Rgb = [170, 40, 40]
    const swatch = blank(16, 16, RED)
    paint(swatch, { x: 0, y: 0, width: 4, height: 16 }, NAVY)
    const front = blank(40, 40, RED)
    paint(front, { x: 10, y: 0, width: 20, height: 4 }, NAVY)
    const fabric = averageColor(swatch, new Uint8Array(16 * 16).fill(1), { x: 0, y: 0, width: 16, height: 16 })

    expect(colorAt(coverNeckOpening(front, 10, swatch, fabric), 15, 2)).toEqual(NAVY)
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
    expect(coverage(mask, 100, bounds)).toBeCloseTo((40 * 15 + 2 * 15 * 65) / (40 * 80), 5)
  })
})
