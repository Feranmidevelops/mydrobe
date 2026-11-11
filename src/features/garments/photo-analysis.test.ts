import { describe, expect, it } from 'vitest'
import { photographed } from '../../test/hanging-top'
import { colorDistance, type RgbaImage } from './photo-mapping'
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

  it('keeps a hand holding a top up off its front, filling it with the fabric', () => {
    const SKIN = [205, 150, 125]
    const image = photo(120, 160)
    const paint = (x: number, y: number, width: number, height: number, color = [150, 40, 40]) => {
      for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) image.data.set([...color, 255], (row * 120 + column) * 4)
      }
    }
    paint(15, 40, 90, 30) // shoulders and sleeves
    paint(30, 40, 60, 110) // body
    paint(80, 85, 32, 14, SKIN) // a hand reaching in across the body's right edge

    const { crop, front } = analyseGarmentPhoto(image, 'shirt-short-sleeve')
    expect(crop.x + crop.width).toBeGreaterThan(80)
    const colors = new Set<string>()
    for (let i = 0; i < front.data.length; i += 4) colors.add(front.data.slice(i, i + 3).join())
    expect([...colors]).toEqual(['150,40,40'])
  })

  /**
   * A navy tee photographed whole on a grey backdrop, as a JPEG or a WebP: its
   * neck opening a U `deep` px below the shoulders, showing the inside of the
   * back in shade under the back's collar, and a cream collar `rib` px wide
   * around it. Returns the photo and which of its pixels are the collar.
   */
  function teeWithCollar(deep: number, rib: number, softness: 'jpeg' | 'webp') {
    const [width, height] = [640, 860]
    const NAVY = [36, 55, 94]
    const shade = NAVY.map((v) => v * 0.6)
    const CREAM = [236, 232, 224]
    const [cx, shoulders, half] = [320, 200, 75]
    const front = (x: number) => shoulders - 4 + deep * Math.sqrt(Math.max(0, 1 - ((x - cx) / half) ** 2))
    const outer = (x: number) => shoulders - 4 + (deep + rib) * Math.sqrt(Math.max(0, 1 - ((x - cx) / (half + rib)) ** 2))
    const colourAt = (x: number, y: number) => {
      const garment = (y >= shoulders && y < 330 && x >= 60 && x < 580) || (y >= shoulders && y < 820 && x >= 170 && x < 470)
      const backCollar = Math.abs(x - cx) < half + rib && y >= shoulders - 18 && y < shoulders
      if (Math.abs(x - cx) < half && y >= shoulders - 4 && y < front(x)) return { color: shade, collar: false }
      if (Math.abs(x - cx) < half + rib && y >= shoulders - 4 && y < outer(x)) return { color: CREAM, collar: true }
      if (garment || backCollar) return { color: NAVY, collar: false }
      return { color: [140, 140, 145], collar: false }
    }
    const planes = [0, 1, 2].map(() => new Float32Array(width * height))
    const collar = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let inCollar = 0
        const sum = [0, 0, 0]
        for (let s = 0; s < 16; s++) {
          const { color, collar: c } = colourAt(x + ((s % 4) + 0.5) / 4, y + (Math.floor(s / 4) + 0.5) / 4)
          for (let k = 0; k < 3; k++) sum[k] += color[k] / 16
          if (c) inCollar++
        }
        for (let k = 0; k < 3; k++) planes[k][y * width + x] = sum[k]
        if (inCollar === 16) collar[y * width + x] = 1
      }
    }
    return { image: { data: photographed(planes, width, height, softness), width, height } satisfies RgbaImage, collar }
  }

  it.each([
    [14, 6, 'jpeg'],
    [20, 8, 'webp'],
    [24, 10, 'jpeg'],
    [18, 6, 'webp'],
  ] as const)('keeps a tee’s contrasting collar on its front, the neckline dipping %i px, the collar %i px wide, as a %s', (deep, rib, softness) => {
    const { image, collar } = teeWithCollar(deep, rib, softness)
    const { crop, front } = analyseGarmentPhoto(image, 'shirt-short-sleeve')
    let [size, changed] = [0, 0]
    for (let y = 0; y < crop.height; y++) {
      for (let x = 0; x < crop.width; x++) {
        const source = (crop.y + y) * image.width + crop.x + x
        if (!collar[source]) continue
        size++
        const [p, q] = [source * 4, (y * crop.width + x) * 4]
        const before: [number, number, number] = [image.data[p], image.data[p + 1], image.data[p + 2]]
        const after: [number, number, number] = [front.data[q], front.data[q + 1], front.data[q + 2]]
        if (colorDistance(before, after) > 30) changed++
      }
    }
    expect(size).toBeGreaterThan(100)
    expect(changed).toBeLessThanOrEqual(Math.max(5, 0.05 * size))
  })

  it('explains when there is no garment to find', () => {
    expect(() => analyseGarmentPhoto(photo(50, 50), 'trousers-straight')).toThrow(PhotoMappingError)
  })
})
