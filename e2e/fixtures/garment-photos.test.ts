import { describe, expect, it } from 'vitest'
import { suggestGarmentName } from '../../src/features/garments/garment.colors'
import { analyseGarmentPhoto } from '../../src/features/garments/photo-analysis'
import { colorDistance, DEFAULT_BACKGROUND_TOLERANCE, type Rect } from '../../src/features/garments/photo-mapping'
import { reviewWarnings } from '../../src/features/garments/upload-review'
import { BACKDROP, BLUE, EXPECTED, POCKET, POCKET_RECT, RED, shirtPhoto, trousersPhoto } from './garment-photos.ts'

/*
 * Runs the app's real photo analysis on the exact pixels the browser tests
 * upload, so a change to the analysis that would break the journey fails here
 * first, in seconds rather than minutes.
 */

function margins({ bounds, image }: ReturnType<typeof analyseGarmentPhoto>) {
  return [bounds.x, bounds.y, image.width - bounds.x - bounds.width, image.height - bounds.y - bounds.height]
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

describe('the generated garment photos', () => {
  it('separate the shirt cleanly, with its pocket on the front only', () => {
    const analysis = analyseGarmentPhoto(shirtPhoto(), 'shirt-long-sleeve')

    expect(Math.min(...margins(analysis))).toBeGreaterThanOrEqual(40)
    expect(analysis.crop.width).toBeLessThan(analysis.bounds.width * 0.65) // sleeves left off the front
    expect(analysis.coverage).toBeGreaterThan(0.9)
    expect(reviewWarnings(analysis, 'shirt-long-sleeve')).toEqual([])
    expect(suggestGarmentName(analysis.palette[0], 'shirt', 'shirt-long-sleeve')).toBe(EXPECTED.shirt.suggested)
    // The pocket is mapped onto the front, but the fabric for the back and sleeves avoids it.
    expect(analysis.palette.every((color) => colorDistance(color, POCKET) > 60)).toBe(true)
    expect(contains(analysis.crop, POCKET_RECT)).toBe(true)
    expect(overlaps(analysis.swatch, POCKET_RECT)).toBe(false)
  })

  it('name the shirt a tee with short sleeves', () => {
    const analysis = analyseGarmentPhoto(shirtPhoto(), 'shirt-short-sleeve')
    expect(suggestGarmentName(analysis.palette[0], 'shirt', 'shirt-short-sleeve')).toBe('Red tee')
  })

  it('separate the trousers cleanly', () => {
    const analysis = analyseGarmentPhoto(trousersPhoto(), 'trousers-straight')

    expect(Math.min(...margins(analysis))).toBeGreaterThanOrEqual(40)
    // The outline fills 85% of its box; the rest is the gap between the legs, which stays background.
    expect(analysis.coverage).toBeGreaterThan(0.8)
    expect(reviewWarnings(analysis, 'trousers-straight')).toEqual([])
    expect(suggestGarmentName(analysis.palette[0], 'trousers', 'trousers-straight')).toBe(EXPECTED.trousers.suggested)
  })

  it('warn when the shirt is called trousers, as the upload checks expect', () => {
    const analysis = analyseGarmentPhoto(shirtPhoto(), 'trousers-straight')
    expect(reviewWarnings(analysis, 'trousers-straight')).toEqual([expect.stringMatching(/background may show/)])
  })

  it('keep every colour well out of reach of the background fill', () => {
    for (const color of [RED, BLUE, POCKET]) {
      expect(colorDistance(color, BACKDROP)).toBeGreaterThan(2 * DEFAULT_BACKGROUND_TOLERANCE)
    }
  })
})
