import { describe, expect, it } from 'vitest'
import {
  averageColor,
  backdropVariation,
  chooseSwatch,
  colorDistance,
  coverage,
  coverNeckOpening,
  cropAndFill,
  dilateMask,
  erodeMask,
  estimateBackground,
  evenTileBrightness,
  flattenLighting,
  frontCrop,
  garmentMask,
  largestComponent,
  maskBounds,
  resampleTile,
  shoulderRow,
  swatchRect,
  textureBarrier,

  tidyMask,
  torsoRect,
  type Rect,
  type RgbaImage,
  type Rgb,
} from './photo-mapping'
import type { FabricTile } from './pattern-tile'

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

  describe('on a coloured backdrop', () => {
    const PINK: Rgb = [211, 131, 153]
    const SHADOW: Rgb = [140, 80, 98]
    const BLUE: Rgb = [121, 150, 194]
    const garment = { x: 80, y: 40, width: 100, height: 160 }

    /** Paints a shadow of the backdrop's colour over `rect`, deepening over `fade` px in from its left and top edges. */
    function paintShadow(image: RgbaImage, rect: Rect, fade: number) {
      for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
          const depth = Math.min(1, (x - rect.x) / fade, (y - rect.y) / fade)
          const color = PINK.map((c, k) => Math.round(c + (SHADOW[k] - c) * depth)) as Rgb
          image.data.set([...color, 255], (y * image.width + x) * 4)
        }
      }
    }

    it('counts the garment’s cast shadow as backdrop', () => {
      const image = blank(240, 240, PINK)
      // The shadow falls down and to the left, from under the garment.
      paintShadow(image, { x: 50, y: 60, width: 40, height: 160 }, 12)
      paint(image, garment, BLUE)
      const mask = garmentMask(image, estimateBackground(image))
      expect(maskBounds(mask, 240, 240)).toEqual(garment)
      expect(mask[150 * 240 + 75]).toBe(0)
    })

    it('keeps a garment in a darker shade of the backdrop, whose edge is sharp', () => {
      const image = blank(240, 240, PINK)
      paint(image, garment, SHADOW)
      expect(maskBounds(garmentMask(image, estimateBackground(image)), 240, 240)).toEqual(garment)
    })
  })

  it('keeps a grey garment on a grey backdrop', () => {
    const image = blank(240, 240, [150, 150, 150])
    for (let x = 50; x < 80; x++) {
      const v = Math.round(150 - ((x - 50) / 29) * 78)
      paint(image, { x, y: 40, width: 1, height: 160 }, [v, v, v])
    }
    const garment = { x: 80, y: 40, width: 100, height: 160 }
    paint(image, garment, [70, 70, 70])
    // A ramp leads the backdrop down to the garment's grey, but no hue says the garment is a shadow.
    expect(maskBounds(garmentMask(image, estimateBackground(image)), 240, 240)!.width).toBeGreaterThanOrEqual(100)
  })

  it('finds nothing in an empty photo', () => {
    const image = blank(30, 30)
    expect(maskBounds(garmentMask(image, WHITE), 30, 30)).toBeNull()
  })
})

describe('the texture barrier', () => {
  /**
   * Paints a woven buffalo check over `rect`: black, charcoal and grey squares,
   * the black and charcoal ones both within a near-black backdrop's colour
   * range. Plain weave, so neighbouring threads alternate.
   */
  function paintCheck(image: RgbaImage, rect: Rect, origin: { x: number; y: number } = rect) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const dark =
          (Math.floor((x - origin.x) / 12) % 2 === 0 ? 1 : 0) + (Math.floor((y - origin.y) / 12) % 2 === 0 ? 1 : 0)
        const [level, weave] = dark === 2 ? [5, 3] : dark === 1 ? [14, 2] : [120, 15]
        const v = level + weave * ((x + y) % 2 === 0 ? 1 : -1)
        image.data.set([v, v, v, 255], (y * image.width + x) * 4)
      }
    }
  }

  function checkOnBlack() {
    const image = blank(240, 240, [4, 4, 4])
    const rect = { x: 60, y: 30, width: 120, height: 180 }
    paintCheck(image, rect)
    return { image, rect }
  }

  it.each([40, 70])('keeps the dark squares of a woven check on a dark backdrop, at tolerance %i', (tolerance) => {
    const { image, rect } = checkOnBlack()
    const mask = garmentMask(image, estimateBackground(image), tolerance)
    const bounds = maskBounds(mask, 240, 240)!
    expect(bounds).toEqual(rect)
    expect(coverage(mask, 240, rect)).toBeGreaterThan(0.95)
    expect(torsoRect(mask, 240, bounds).width).toBeGreaterThanOrEqual(115)
  })

  it('keeps most of the check even at a high tolerance', () => {
    const { image, rect } = checkOnBlack()
    expect(coverage(garmentMask(image, estimateBackground(image), 110), 240, rect)).toBeGreaterThan(0.9)
  })

  it('keeps check trouser legs whole, and the gap between them open', () => {
    const image = blank(240, 240, [4, 4, 4])
    const parts = [
      { x: 60, y: 20, width: 120, height: 48 },
      { x: 60, y: 68, width: 48, height: 150 },
      { x: 132, y: 68, width: 48, height: 150 },
    ]
    for (const part of parts) paintCheck(image, part, { x: 60, y: 20 })
    const mask = garmentMask(image, estimateBackground(image))
    const area = (part: Rect) => part.width * part.height
    const kept = parts.reduce((sum, part) => sum + coverage(mask, 240, part) * area(part), 0)
    expect(kept / parts.reduce((sum, part) => sum + area(part), 0)).toBeGreaterThan(0.95)
    expect(mask[150 * 240 + 120]).toBe(0)
    expect(mask[210 * 240 + 120]).toBe(0)
  })

  it('lets a backdrop go however busy its own grain is', () => {
    const image = blank(240, 240)
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 240; x++) {
        const grain = (y % 6 < 3 ? 8 : -8) + ((x * 3 + y * 5) % 7) - 3
        image.data.set([40 + grain, 30 + grain, 22 + grain, 255], (y * 240 + x) * 4)
      }
    }
    const rect = { x: 60, y: 30, width: 120, height: 180 }
    paint(image, rect, [150, 140, 120])
    expect(maskBounds(garmentMask(image, estimateBackground(image)), 240, 240)).toEqual(rect)
  })

  it('lets a smooth halo of light round a dark garment go', () => {
    const image = blank(240, 240)
    const rect = { x: 60, y: 30, width: 120, height: 180 }
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 240; x++) {
        const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width - 1))
        const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height - 1))
        const inside = dx === 0 && dy === 0
        const v = inside ? 90 + ((x + y) % 4 < 2 ? 10 : -10) : 5 + 20 * Math.max(0, 1 - Math.hypot(dx, dy) / 25)
        image.data.set([v, v, v, 255], (y * 240 + x) * 4)
      }
    }
    expect(maskBounds(garmentMask(image, estimateBackground(image)), 240, 240)).toEqual(rect)
  })

  it('still drops a busy hanger rail touching a check', () => {
    const { image, rect } = checkOnBlack()
    for (let y = 40; y < 44; y++) {
      for (let x = 180; x < 240; x++) {
        const v = x % 3 === 0 ? 30 : 150
        image.data.set([v, v, v, 255], (y * 240 + x) * 4)
      }
    }
    const mask = garmentMask(image, estimateBackground(image))
    expect(mask[42 * 240 + 220]).toBe(0)
    const bounds = maskBounds(mask, 240, 240)!
    expect({ ...bounds, width: rect.width }).toEqual(rect)
    expect(bounds.width).toBeLessThanOrEqual(121)
  })

  it('still holds when the check runs off the edge of the photo', () => {
    const image = blank(240, 240, [4, 4, 4])
    const rect = { x: 60, y: 30, width: 180, height: 180 }
    paintCheck(image, rect)
    const mask = garmentMask(image, estimateBackground(image))
    expect(coverage(mask, 240, rect)).toBeGreaterThan(0.95)
  })

  it('never lets the backdrop it holds back change which patch is the garment', () => {
    // A plain grey garment on the left; a belt and a shoe on the right, with a
    // strip of textured backdrop between them that the barrier holds back.
    const image = blank(240, 240, [4, 4, 4])
    const garment = { x: 20, y: 60, width: 60, height: 100 }
    paint(image, garment, [130, 130, 130])
    paint(image, { x: 120, y: 80, width: 40, height: 90 }, [150, 90, 40])
    paint(image, { x: 180, y: 80, width: 40, height: 90 }, [200, 200, 200])
    for (let y = 80; y < 170; y++) {
      for (let x = 160; x < 180; x++) {
        const v = 5 + 3 * ((x + y) % 2 === 0 ? 1 : -1)
        image.data.set([v, v, v, 255], (y * 240 + x) * 4)
      }
    }
    expect(maskBounds(garmentMask(image, estimateBackground(image)), 240, 240)).toEqual(garment)
  })

  it('stays by the garment, and loosens as the tolerance rises', () => {
    const { image, rect } = checkOnBlack()
    let farthest = 0
    const blockedAt = (tolerance: number) => {
      const inRange = new Uint8Array(240 * 240)
      for (let i = 0; i < inRange.length; i++) {
        const v = image.data[i * 4]
        if (colorDistance([v, v, v], [4, 4, 4]) <= 2 * tolerance) inRange[i] = 1
      }
      const blocked = textureBarrier(image, inRange, tolerance)
      let count = 0
      for (let i = 0; i < blocked.length; i++) {
        if (!blocked[i]) continue
        count++
        const x = i % 240
        const y = Math.floor(i / 240)
        const outside = Math.max(rect.x - x, x - (rect.x + rect.width - 1), rect.y - y, y - (rect.y + rect.height - 1), 0)
        farthest = Math.max(farthest, outside)
      }
      return count
    }
    const [loose, normal, tight] = [blockedAt(110), blockedAt(70), blockedAt(40)]
    expect(normal).toBeGreaterThan(0)
    expect(loose).toBeLessThanOrEqual(normal)
    expect(normal).toBeLessThanOrEqual(tight)
    expect(farthest).toBeLessThanOrEqual(16)
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

describe('backdrop the tidying would fill in', () => {
  it('leaves a gap between an arm and the body open, though it is narrower than the closing', () => {
    // At 800 px the closing fills gaps up to 41 px wide; this one is 40.
    const image = blank(800, 500)
    paint(image, { x: 330, y: 80, width: 220, height: 380 }, NAVY) // body
    paint(image, { x: 230, y: 80, width: 100, height: 60 }, NAVY) // shoulder
    paint(image, { x: 230, y: 80, width: 60, height: 360 }, NAVY) // arm, hanging beside the body
    const mask = garmentMask(image, WHITE)
    for (const y of [150, 300, 430]) {
      for (const x of [291, 310, 328]) expect(mask[y * 800 + x]).toBe(0)
    }
    expect(mask[300 * 800 + 260]).toBe(1)
    expect(mask[300 * 800 + 400]).toBe(1)
  })

  it('leaves the gap between trouser legs open along its whole length', () => {
    // At 400 px the closing fills gaps up to 21 px wide; this one is 20.
    const image = blank(400, 400)
    paint(image, { x: 120, y: 40, width: 160, height: 60 }, NAVY)
    paint(image, { x: 120, y: 100, width: 70, height: 260 }, NAVY)
    paint(image, { x: 210, y: 100, width: 70, height: 260 }, NAVY)
    const mask = garmentMask(image, WHITE)
    for (let y = 100; y < 360; y++) expect(mask[y * 400 + 200]).toBe(0)
    expect(mask[99 * 400 + 200]).toBe(1)
  })

  it('keeps a dark square lost to a dark backdrop at the hem, when the garment shows that colour too', () => {
    const BLACK: Rgb = [4, 4, 4]
    const image = blank(400, 400, BLACK)
    paint(image, { x: 100, y: 60, width: 200, height: 280 }, [130, 130, 130])
    for (const [x, y] of [[140, 100], [220, 100], [140, 200], [220, 200]]) paint(image, { x, y, width: 30, height: 30 }, BLACK)
    paint(image, { x: 180, y: 316, width: 18, height: 24 }, BLACK)
    const mask = garmentMask(image, estimateBackground(image))
    expect(mask[330 * 400 + 189]).toBe(1)
    expect(mask[325 * 400 + 182]).toBe(1)
  })

  it('keeps a small notch filled', () => {
    const image = blank(400, 400)
    paint(image, { x: 100, y: 60, width: 200, height: 280 }, NAVY)
    paint(image, { x: 190, y: 336, width: 4, height: 4 }, WHITE)
    expect(garmentMask(image, WHITE)[338 * 400 + 192]).toBe(1)
  })
})

describe('a check whose light squares match the backdrop', () => {
  // A grey buffalo check on a wall of the same grey as its light squares:
  // where a light square meets the edge of the garment, nothing in the photo
  // says where the wall stops and the shirt starts.
  const WALL: Rgb = [150, 150, 150]
  const MID: Rgb = [95, 95, 95]
  const DARK: Rgb = [40, 40, 40]
  const SQUARE = 30
  const SIZE = 480

  /**
   * Paints a flat buffalo check over `rect`, in squares of SQUARE px counted
   * from `origin`: the wall's grey where a light band down meets a light band
   * across, dark where two dark bands meet, and mid grey where they cross.
   * Bands down are light when their number has the parity `columns`, bands
   * across when theirs has the parity `rows`.
   */
  function paintCheck(image: RgbaImage, rect: Rect, origin: { x: number; y: number }, columns: number, rows: number) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const lightDown = Math.floor((x - origin.x) / SQUARE) % 2 === columns
        const lightAcross = Math.floor((y - origin.y) / SQUARE) % 2 === rows
        const color = lightDown && lightAcross ? WALL : lightDown || lightAcross ? MID : DARK
        image.data.set([...color, 255], (y * image.width + x) * 4)
      }
    }
  }

  /** Whether the centre of square (`column`, `row`), counted from `origin`, is garment. */
  const kept = (mask: Uint8Array, origin: { x: number; y: number }, column: number, row: number) =>
    mask[(origin.y + row * SQUARE + SQUARE / 2) * SIZE + origin.x + column * SQUARE + SQUARE / 2] === 1

  it('keeps the light squares along the sides of a shirt', () => {
    // Seven bands down, light first and last, so light squares line both
    // sides; light bands across every other row from the second, so no light
    // square sits in a corner, where nothing could tell it from the wall.
    const image = blank(SIZE, SIZE, WALL)
    const body = { x: 135, y: 60, width: 7 * SQUARE, height: 11 * SQUARE }
    paintCheck(image, body, body, 0, 1)
    const mask = garmentMask(image, estimateBackground(image))
    for (let row = 1; row < 11; row += 2) {
      expect(kept(mask, body, 0, row)).toBe(true)
      expect(kept(mask, body, 6, row)).toBe(true)
    }
    expect(maskBounds(mask, SIZE, SIZE)).toEqual(body)
    expect(coverage(mask, SIZE, body)).toBeGreaterThan(0.98)
  })

  it('keeps the light squares along the hem, so the front is the shirt’s full width', () => {
    // Light bands down every other one from the second, so none on the sides;
    // the last band across is light, so light squares sit along the hem, and
    // it's deep enough to hold every row torsoRect measures the hem on.
    const image = blank(SIZE, SIZE, WALL)
    const body = { x: 135, y: 150, width: 7 * SQUARE, height: 6 * SQUARE }
    paintCheck(image, body, body, 1, 1)
    const { mask, bounds } = analyse(image)
    for (const column of [1, 3, 5]) expect(kept(mask, body, column, 5)).toBe(true)
    expect(torsoRect(mask, SIZE, bounds)).toEqual(body)
  })

  it('keeps the light squares along trouser legs, but leaves the gap between the legs open', () => {
    // Each leg is three bands wide, light on both sides, so the light squares
    // on its inside edge face a gap of wall as wide as a square.
    const image = blank(SIZE, SIZE, WALL)
    const origin = { x: 135, y: 30 }
    const waistband = { x: 135, y: 30, width: 7 * SQUARE, height: 2 * SQUARE }
    const legs = [
      { x: 135, y: 90, width: 3 * SQUARE, height: 12 * SQUARE },
      { x: 255, y: 90, width: 3 * SQUARE, height: 12 * SQUARE },
    ]
    for (const part of [waistband, ...legs]) paintCheck(image, part, origin, 0, 1)
    const mask = garmentMask(image, estimateBackground(image))
    // The light rows down the legs, short of the last, whose light squares are in the corners.
    for (let row = 3; row < 13; row += 2) {
      for (const column of [0, 2, 4, 6]) expect(kept(mask, origin, column, row)).toBe(true)
    }
    for (let y = 120; y < 450; y++) expect(mask[y * SIZE + 240]).toBe(0)
  })

  it('keeps the light squares down an arm, but leaves the gap under it open where an elbow narrows it', () => {
    // The arm is two bands wide with light squares down its inside edge,
    // facing a gap of wall two squares wide that the elbow narrows to 36 px
    // for a little way: no wider than a square bitten out of the edge.
    const image = blank(SIZE, SIZE, WALL)
    const origin = { x: 105, y: 60 }
    const shoulders = { x: 105, y: 60, width: 9 * SQUARE, height: SQUARE }
    const arm = { x: 105, y: 60, width: 2 * SQUARE, height: 10 * SQUARE }
    const elbow = { x: 165, y: 200, width: 24, height: 24 }
    const body = { x: 225, y: 60, width: 5 * SQUARE, height: 11 * SQUARE }
    for (const part of [shoulders, arm, elbow, body]) paintCheck(image, part, origin, 1, 1)
    const mask = garmentMask(image, estimateBackground(image))
    for (const row of [1, 3, 5, 7]) expect(kept(mask, origin, 1, row)).toBe(true)
    for (let y = elbow.y; y < elbow.y + elbow.height; y++) expect(mask[y * SIZE + 205]).toBe(0)
    for (const y of [150, 300]) expect(mask[y * SIZE + 195]).toBe(0)
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
  it('erodes and dilates exactly as checking the whole square round each pixel would', () => {
    // A slow, obvious version to compare against, on scattered blobs.
    function bySquares(mask: Uint8Array, width: number, height: number, radius: number, erode: boolean) {
      const result = new Uint8Array(mask.length)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let all = true
          let any = false
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const [sx, sy] = [x + dx, y + dy]
              const on = sx >= 0 && sy >= 0 && sx < width && sy < height && mask[sy * width + sx] === 1
              all &&= on
              any ||= on
            }
          }
          result[y * width + x] = (erode ? all : any) ? 1 : 0
        }
      }
      return result
    }
    const [width, height] = [37, 23]
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i++) mask[i] = (i * 7919) % 11 < 6 || (i % width > 8 && i % width < 20) ? 1 : 0
    for (const radius of [1, 2, 3]) {
      expect(erodeMask(mask, width, height, radius)).toEqual(bySquares(mask, width, height, radius, true))
      expect(dilateMask(mask, width, height, radius)).toEqual(bySquares(mask, width, height, radius, false))
    }
  })
})

describe('front crop', () => {
  it('keeps only the body of a top, leaving the sleeves out', () => {
    const { mask, bounds } = analyse(shirtPhoto())
    expect(torsoRect(mask, 100, bounds)).toEqual({ x: 35, y: 20, width: 30, height: 70 })
    expect(frontCrop('shirt-long-sleeve', mask, 100, bounds)).toEqual(torsoRect(mask, 100, bounds))
  })

  it('starts a top on a hanger just above its shoulders, leaving most of the hanger out', () => {
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
  it('steers clear of a big chest print that spans most of the shirt', () => {
    // A navy tee with a yellow print 62% of its width and 53% of its height, from just below the shoulders.
    const image = blank(200, 200)
    paint(image, { x: 50, y: 30, width: 100, height: 150 }, NAVY)
    paint(image, { x: 69, y: 45, width: 62, height: 80 }, [230, 190, 60])
    const mask = garmentMask(image, WHITE)
    const swatch = chooseSwatch('shirt-short-sleeve', image, mask, { x: 50, y: 30, width: 100, height: 150 })
    expect(averageColor(image, mask, swatch)).toEqual(NAVY)
  })

  it('takes plain fabric from between the creases, clear of backdrop showing through', () => {
    const DENIM: Rgb = [40, 70, 100]
    const image = blank(200, 200)
    paint(image, { x: 50, y: 30, width: 100, height: 150 }, DENIM)
    for (let y = 40; y < 170; y += 30) paint(image, { x: 50, y, width: 100, height: 6 }, [90, 110, 130])
    paint(image, { x: 110, y: 120, width: 14, height: 14 }, [218, 218, 218])
    const mask = garmentMask(image, WHITE)
    const swatch = chooseSwatch('trousers-straight', image, mask, { x: 50, y: 30, width: 100, height: 150 })
    expect(averageColor(image, mask, swatch)).toEqual(DENIM)
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

describe('neck opening', () => {
  const CREAM: Rgb = [236, 232, 224]
  const WOOD: Rgb = [150, 100, 60]
  const LABEL: Rgb = [20, 20, 20]

  it('paints over a hanger and a label, and leaves the chest alone', () => {
    const front = blank(60, 80, CREAM)
    paint(front, { x: 20, y: 0, width: 20, height: 6 }, WOOD)
    paint(front, { x: 26, y: 6, width: 8, height: 4 }, LABEL)
    paint(front, { x: 10, y: 50, width: 10, height: 10 }, NAVY)
    const covered = coverNeckOpening(front, 12, blank(16, 16, CREAM), CREAM)

    expect(colorAt(covered, 30, 2)).toEqual(CREAM)
    expect(colorAt(covered, 30, 8)).toEqual(CREAM)
    expect(colorAt(covered, 15, 55)).toEqual(NAVY)
  })

  it('keeps colours found lower down the front, like the squares of a check', () => {
    // The fabric sample happens to be all red, but navy squares run the length of the shirt.
    const RED: Rgb = [170, 40, 40]
    const front = blank(60, 80, RED)
    for (let y = 0; y < 80; y += 20) {
      for (let x = 0; x < 60; x += 20) paint(front, { x, y, width: 10, height: 10 }, NAVY)
    }
    expect(colorAt(coverNeckOpening(front, 12, blank(16, 16, RED), RED), 5, 5)).toEqual(NAVY)
  })

  it('paints over the backdrop showing through, even when a print lower down shares its colour', () => {
    const BLACK: Rgb = [20, 20, 20]
    const front = blank(60, 80, BLACK)
    paint(front, { x: 22, y: 2, width: 16, height: 6 }, WHITE)
    paint(front, { x: 10, y: 40, width: 40, height: 20 }, WHITE)
    const covered = coverNeckOpening(front, 12, blank(16, 16, BLACK), BLACK, WHITE)
    expect(colorAt(covered, 30, 4)).toEqual(BLACK)
    expect(colorAt(covered, 30, 50)).toEqual(WHITE)
  })

  it('takes the soft edge around a hanger with it, but leaves the same colour elsewhere', () => {
    const BLACK: Rgb = [20, 20, 20]
    const EDGE: Rgb = [130, 120, 110]
    const front = blank(60, 80, BLACK)
    // Backdrop through the neck, ringed by a pixel of blended edge.
    paint(front, { x: 19, y: 1, width: 22, height: 8 }, EDGE)
    paint(front, { x: 20, y: 2, width: 20, height: 6 }, WHITE)
    paint(front, { x: 4, y: 4, width: 1, height: 1 }, EDGE)
    // A print lower down with the same blended edge, so that colour is the shirt's own.
    paint(front, { x: 9, y: 39, width: 42, height: 22 }, EDGE)
    paint(front, { x: 10, y: 40, width: 40, height: 20 }, WHITE)
    const covered = coverNeckOpening(front, 12, blank(16, 16, BLACK), BLACK, WHITE)

    expect(colorAt(covered, 19, 5)).toEqual(BLACK)
    expect(colorAt(covered, 30, 1)).toEqual(BLACK)
    expect(colorAt(covered, 4, 4)).toEqual(EDGE)
  })

  it('keeps a collar in a contrasting colour, whose front dips lower', () => {
    const front = blank(60, 80, CREAM)
    paint(front, { x: 18, y: 0, width: 24, height: 4 }, NAVY)
    paint(front, { x: 18, y: 0, width: 4, height: 16 }, NAVY)
    paint(front, { x: 38, y: 0, width: 4, height: 16 }, NAVY)
    paint(front, { x: 18, y: 12, width: 24, height: 4 }, NAVY)
    expect(colorAt(coverNeckOpening(front, 12, blank(16, 16, CREAM), CREAM), 30, 2)).toEqual(NAVY)
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

describe('fabric tiles', () => {
  /** A tile whose texel (x, y) is coloured [10x, 10y, 0], so a test can tell which texel landed where. */
  function numberedTile(width: number, height: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) data.set([10 * x, 10 * y, 0, 255], (y * width + x) * 4)
    }
    return { data, width, height }
  }

  const lattice: FabricTile = {
    pixels: numberedTile(4, 3),
    width: 8,
    height: 6,
    wrap: 'repeat',
    placement: { origin: [10, 20], u: [8, 0], v: [0, 6] },
  }

  it('resizes a tile round its own edges, the way it will repeat', () => {
    const grey = { data: new Uint8ClampedArray([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]), width: 3, height: 1 }
    const repeat = resampleTile(grey, 6, 'repeat')
    const mirror = resampleTile(grey, 6, 'mirror')
    expect([colorAt(repeat, 0, 0)[0], colorAt(repeat, 5, 0)[0]]).toEqual([45, 135])
    expect([colorAt(mirror, 0, 0)[0], colorAt(mirror, 5, 0)[0]]).toEqual([0, 180])
  })

  it('fills just as before with the plain sample', () => {
    const image = trousersPhoto()
    const { mask, bounds } = analyse(image)
    const swatchPixels = numberedTile(5, 5)
    const tile: FabricTile = { pixels: swatchPixels, width: 5, height: 5, wrap: 'mirror' }
    expect(cropAndFill(image, mask, bounds, tile)).toEqual(cropAndFill(image, mask, bounds, swatchPixels))
  })

  it('lays a repeat in step with the photo it came from', () => {
    const image = blank(40, 40)
    const filled = cropAndFill(image, new Uint8Array(40 * 40), { x: 0, y: 0, width: 40, height: 40 }, lattice)
    expect(colorAt(filled, 21, 28)).toEqual([10, 10, 0])
    expect(colorAt(filled, 9, 19)).toEqual([30, 20, 0])
  })

  it('evens a repeat to the brightness of the photo it came from, without shifting its colours', () => {
    // A mid-grey photo, and a tile of it that came out darker.
    const image = blank(40, 40, [128, 128, 128])
    const mask = new Uint8Array(40 * 40).fill(1)
    const dark: FabricTile = { ...lattice, pixels: blank(4, 3, [115, 115, 115]) }
    const evened = evenTileBrightness(dark, image, mask)
    const [r, g, b] = colorAt(evened.pixels, 1, 1)
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1)
    expect([g, b]).toEqual([r, r])
    expect(evened.placement).toBe(dark.placement)
  })

  it('leaves the plain sample as it is', () => {
    const plain: FabricTile = { pixels: blank(4, 4, [100, 100, 100]), width: 4, height: 4, wrap: 'mirror' }
    expect(evenTileBrightness(plain, blank(40, 40), new Uint8Array(40 * 40).fill(1))).toBe(plain)
  })

  it('paints the neck opening in step with the photo too', () => {
    const WOOD: Rgb = [150, 100, 60]
    const covered = coverNeckOpening(blank(20, 10, WOOD), 10, lattice, [236, 232, 224], null, [5, 7])
    // Front pixel (4, 3) is photo pixel (9, 10), which is texel (3, 1) of the repeat.
    expect(colorAt(covered, 4, 3)).toEqual([30, 10, 0])
  })
})
