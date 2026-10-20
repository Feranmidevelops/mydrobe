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
    expect(analysis.palette).toEqual([[150, 40, 40]])
    expect(analysis.front.width).toBe(40)
    expect(analysis.swatchPixels.width).toBe(analysis.swatch.width)
    // A plain fabric tiles its sample, mirrored, at the sample's own size.
    expect(analysis.tile).toEqual({ pixels: analysis.swatchPixels, width: 40 * 0.2, height: 40 * 0.2, wrap: 'mirror' })
    expect(analysis.tile.pixels).toBe(analysis.swatchPixels)
  })

  it('keeps a wooden hanger off the front of a tee', () => {
    const WOOD = [150, 100, 60]
    const image = photo(120, 160)
    const paint = (x: number, y: number, width: number, height: number, color = [150, 40, 40]) => {
      for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) image.data.set([...color, 255], (row * 120 + column) * 4)
      }
    }
    for (let y = 10; y < 34; y++) paint(60 - (y - 4), y, 2 * (y - 4), 1, WOOD) // the hanger, widening to the collar
    paint(42, 34, 36, 6) // collar
    paint(15, 40, 90, 30) // shoulders and sleeves
    paint(30, 40, 60, 110) // body

    const { front } = analyseGarmentPhoto(image, 'shirt-short-sleeve')
    const colors = new Set<string>()
    for (let i = 0; i < front.data.length; i += 4) colors.add(front.data.slice(i, i + 3).join())
    expect([...colors]).not.toContain(WOOD.join())
  })

  it('explains when there is no garment to find', () => {
    expect(() => analyseGarmentPhoto(photo(50, 50), 'trousers-straight')).toThrow(PhotoMappingError)
  })
})
