import { describe, expect, it } from 'vitest'
import type { RgbaImage } from './photo-mapping'
import { analyseGarmentPhoto, PhotoMappingError } from './photo-analysis'

function photo(width: number, height: number, garment?: { x: number; y: number; width: number; height: number }) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  if (garment) {
    for (let y = garment.y; y < garment.y + garment.height; y++) {
      for (let x = garment.x; x < garment.x + garment.width; x++) {
        data.set([150, 40, 40, 255], (y * width + x) * 4)
      }
    }
  }
  return { data, width, height } satisfies RgbaImage
}

describe('analyseGarmentPhoto', () => {
  it('crops to the garment and samples its fabric', () => {
    const analysis = analyseGarmentPhoto(photo(80, 100, { x: 20, y: 10, width: 40, height: 80 }), 'shirt-short-sleeve')

    expect(analysis.background).toEqual([255, 255, 255])
    expect(analysis.crop).toEqual({ x: 20, y: 10, width: 40, height: 80 })
    expect(analysis.fabric).toEqual([150, 40, 40])
    expect(analysis.coverage).toBe(1)
    expect(analysis.front.width).toBe(40)
    expect(analysis.swatchPixels.width).toBe(analysis.swatch.width)
  })

  it('explains when there is no garment to find', () => {
    expect(() => analyseGarmentPhoto(photo(50, 50), 'trousers-straight')).toThrow(PhotoMappingError)
  })
})
