import { describe, expect, it } from 'vitest'
import { analysisTemplateFor, fabricOutline, fadeBackground, reviewWarnings, templateFor } from './upload-review'

describe('templateFor', () => {
  it('matches shirts and trousers to their 3D templates', () => {
    expect(templateFor('shirt', 'long')).toBe('shirt-long-sleeve')
    expect(templateFor('shirt', 'short')).toBe('shirt-short-sleeve')
    expect(templateFor('trousers', 'long')).toBe('trousers-straight')
  })

  it('leaves other kinds of clothes without one', () => {
    expect(templateFor('outerwear', 'long')).toBeNull()
    expect(templateFor('shoes', 'short')).toBeNull()
  })
})

describe('analysisTemplateFor', () => {
  it('analyses 2D-only pieces with the whole-outline trousers crop', () => {
    expect(analysisTemplateFor(null)).toBe('trousers-straight')
    expect(analysisTemplateFor('shirt-short-sleeve')).toBe('shirt-short-sleeve')
  })
})

describe('reviewWarnings', () => {
  const image = { width: 1000, height: 1200 }
  const centred = { x: 200, y: 150, width: 600, height: 800 }
  // A shirt's body on a hanger, about half as wide as it is long.
  const crop = { x: 300, y: 160, width: 400, height: 780 }

  it('has nothing to say about a well-framed photo', () => {
    expect(reviewWarnings({ image, bounds: centred, crop, coverage: 0.95 }, 'shirt-long-sleeve')).toEqual([])
  })

  it('notices a garment running off the edge of the photo', () => {
    const cutOff = { ...centred, y: 0 }
    expect(reviewWarnings({ image, bounds: cutOff, crop, coverage: 0.95 }, 'shirt-long-sleeve')).toEqual([
      expect.stringMatching(/cut off at the edge/),
    ])
  })

  it('suggests a closer shot for a tiny garment', () => {
    const tiny = { x: 450, y: 500, width: 100, height: 150 }
    expect(reviewWarnings({ image, bounds: tiny, crop: tiny, coverage: 0.95 }, 'trousers-straight')).toEqual([
      expect.stringMatching(/quite small/),
    ])
  })

  it('warns about background showing on the mannequin only when it will be worn', () => {
    expect(reviewWarnings({ image, bounds: centred, crop, coverage: 0.6 }, 'shirt-long-sleeve')).toEqual([
      expect.stringMatching(/background may show/),
    ])
    expect(reviewWarnings({ image, bounds: centred, crop, coverage: 0.6 }, null)).toEqual([])
  })

  it('notices a top that looks folded or cut short', () => {
    const folded = { x: 220, y: 200, width: 555, height: 438 }
    expect(reviewWarnings({ image, bounds: centred, crop: folded, coverage: 0.95 }, 'shirt-long-sleeve')).toEqual([
      expect.stringMatching(/folded or cut short/),
    ])
    expect(reviewWarnings({ image, bounds: centred, crop: folded, coverage: 0.95 }, 'shirt-short-sleeve')).toHaveLength(1)
  })

  it('leaves a top laid flat, and trousers and 2D pieces of any shape, alone', () => {
    const flat = { x: 250, y: 200, width: 540, height: 720 }
    expect(reviewWarnings({ image, bounds: centred, crop: flat, coverage: 0.95 }, 'shirt-short-sleeve')).toEqual([])
    const wide = { x: 220, y: 200, width: 555, height: 438 }
    expect(reviewWarnings({ image, bounds: centred, crop: wide, coverage: 0.95 }, 'trousers-straight')).toEqual([])
    expect(reviewWarnings({ image, bounds: centred, crop: wide, coverage: 0.95 }, null)).toEqual([])
  })

  it("doesn't add to the note about a garment running off the edge", () => {
    const cutOff = { ...centred, y: 0 }
    const short = { x: 220, y: 0, width: 510, height: 502 }
    expect(reviewWarnings({ image, bounds: cutOff, crop: short, coverage: 0.95 }, 'shirt-long-sleeve')).toEqual([
      expect.stringMatching(/cut off at the edge/),
    ])
  })
})

describe('fadeBackground', () => {
  it('fades the background towards the tint and leaves the garment alone', () => {
    const image = {
      data: new Uint8ClampedArray([
        200, 40, 40, 255, // garment
        0, 0, 0, 255, // background
        10, 20, 30, 0, // transparent background
      ]),
      width: 3,
      height: 1,
    }
    const faded = fadeBackground(image, new Uint8Array([1, 0, 0]), [240, 240, 240], 0.75)

    expect([...faded.data]).toEqual([200, 40, 40, 255, 180, 180, 180, 255, 240, 240, 240, 255])
    expect(image.data[4]).toBe(0)
  })
})

describe('fabricOutline', () => {
  const swatch = { x: 40, y: 50, width: 10, height: 10 }

  it('outlines the plain sample when the fabric has no repeat', () => {
    expect(fabricOutline({ swatch, tile: {} })).toEqual([
      [40, 50],
      [50, 50],
      [50, 60],
      [40, 60],
    ])
  })

  it('outlines one repeat of the pattern, at its slant', () => {
    const tile = { placement: { origin: [10, 20] as [number, number], u: [8, 1] as [number, number], v: [-1, 6] as [number, number] } }
    expect(fabricOutline({ swatch, tile })).toEqual([
      [10, 20],
      [18, 21],
      [17, 27],
      [9, 26],
    ])
  })
})
