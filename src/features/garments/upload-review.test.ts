import { describe, expect, it } from 'vitest'
import { analysisTemplateFor, fadeBackground, reviewWarnings, templateFor } from './upload-review'

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

  it('has nothing to say about a well-framed photo', () => {
    expect(reviewWarnings({ image, bounds: centred, coverage: 0.95 }, 'shirt-long-sleeve')).toEqual([])
  })

  it('notices a garment running off the edge of the photo', () => {
    const cutOff = { ...centred, y: 0 }
    expect(reviewWarnings({ image, bounds: cutOff, coverage: 0.95 }, 'shirt-long-sleeve')).toEqual([
      expect.stringMatching(/cut off at the edge/),
    ])
  })

  it('suggests a closer shot for a tiny garment', () => {
    const tiny = { x: 450, y: 500, width: 100, height: 150 }
    expect(reviewWarnings({ image, bounds: tiny, coverage: 0.95 }, 'trousers-straight')).toEqual([
      expect.stringMatching(/quite small/),
    ])
  })

  it('warns about background showing on the mannequin only when it will be worn', () => {
    expect(reviewWarnings({ image, bounds: centred, coverage: 0.6 }, 'shirt-long-sleeve')).toEqual([
      expect.stringMatching(/background may show/),
    ])
    expect(reviewWarnings({ image, bounds: centred, coverage: 0.6 }, null)).toEqual([])
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
