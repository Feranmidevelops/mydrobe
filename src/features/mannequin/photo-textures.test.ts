import { MirroredRepeatWrapping, RepeatWrapping } from 'three'
import { describe, expect, it } from 'vitest'
import { cropAndFill } from '../garments/photo-mapping'
import type { FabricTile } from '../garments/pattern-tile'
import {
  fabricTransform,
  frontFit,
  frontLayout,
  frontScale,
  mirroredTile,
  paddedSides,
  tileRepeat,
  TYPICAL_FRONT_ASPECT,
  type Affine,
} from './photo-textures'

/** Front panels measured on the Small, Medium and Large bodies, in metres. */
const SHORT_SLEEVE_PANELS = [0.384, 0.42, 0.529].map((width) => ({ width, height: 0.595 }))
const LONG_SLEEVE_PANELS = [0.377, 0.414, 0.523].map((width) => ({ width, height: 0.645 }))

const layoutOn = (crop: { width: number; height: number }, panel: { width: number; height: number }) =>
  frontLayout(crop, panel, frontScale(crop, panel.height))

describe('frontLayout', () => {
  it.each([
    ['a graphic tee on a hanger', { width: 419, height: 781 }, SHORT_SLEEVE_PANELS],
    ['a flannel shirt on a hanger', { width: 455, height: 905 }, LONG_SLEEVE_PANELS],
  ])('keeps the shape of %s on every body, at one size, centred under the collar', (_, crop, panels) => {
    const layouts = panels.map((panel) => layoutOn(crop, panel))
    layouts.forEach((layout, i) => {
      const panel = panels[i]
      expect(Math.abs(layout.width / layout.height / (crop.width / crop.height) - 1)).toBeLessThan(0.005)
      // Sized by its length, the whole height of the panel.
      expect(layout.y).toBe(0)
      expect(layout.height).toBeCloseTo(panel.height, 9)
      expect(layout.x + layout.width / 2).toBeCloseTo(panel.width / 2, 9)
      // So a print is the same size on Small, Medium and Large.
      expect(layout.width).toBeCloseTo(layouts[0].width, 9)
    })
    // Narrower than a Large body, which is padded out at the sides.
    expect(layouts[2].x).toBeGreaterThan(0.05)
  })

  it('sizes a folded shirt by its width, top-aligned and padded below instead of pulled down to the hem', () => {
    const crop = { width: 555, height: 438 }
    for (const panel of LONG_SLEEVE_PANELS) {
      const layout = layoutOn(crop, panel)
      expect(layout.y).toBe(0)
      expect(layout.width).toBeCloseTo(TYPICAL_FRONT_ASPECT * panel.height, 9)
      expect(layout.width / layout.height).toBeCloseTo(555 / 438, 9)
      expect(layout.height).toBeLessThan(panel.height * 0.5)
    }
  })

  it('sizes a shirt cut off at the hem by its width too', () => {
    const crop = { width: 510, height: 502 }
    const layout = layoutOn(crop, LONG_SLEEVE_PANELS[1])
    expect(layout.width / layout.height).toBeCloseTo(510 / 502, 9)
    expect(layout.width).toBeCloseTo(TYPICAL_FRONT_ASPECT * 0.645, 9)
  })

  it('still sizes a boxy tee laid flat by its length', () => {
    const crop = { width: 700, height: 1000 }
    const layout = layoutOn(crop, SHORT_SLEEVE_PANELS[1])
    expect(layout.height).toBeCloseTo(0.595, 9)
    expect(layout.width).toBeCloseTo(0.7 * 0.595, 9)
  })

  it('eases from sizing by length to sizing by width, so a slightly wider crop never jumps in size', () => {
    const heights = Array.from({ length: 61 }, (_, i) => {
      const crop = { width: 600 + i * 10, height: 1000 }
      return layoutOn(crop, LONG_SLEEVE_PANELS[1]).height
    })
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeLessThanOrEqual(heights[i - 1] + 1e-12)
      expect(heights[i - 1] - heights[i]).toBeLessThan(0.645 * 0.04)
    }
    expect(heights[0]).toBeCloseTo(0.645, 9)
    expect(heights[60]).toBeCloseTo((TYPICAL_FRONT_ASPECT * 0.645) / 1.2, 9)
  })

  it('trims a crop wider than a narrow body rather than squeezing it', () => {
    const crop = { width: 700, height: 1000 }
    const layout = layoutOn(crop, { width: 0.36, height: 0.595 })
    expect(layout.x).toBeLessThan(0)
    expect(layout.width / layout.height).toBeCloseTo(0.7, 9)
  })
})

describe('paddedSides', () => {
  it('finds the sides of the photo that fall inside the canvas', () => {
    expect(paddedSides({ x: 40, y: 0, width: 520, height: 952 }, 600, 952)).toEqual({
      left: true,
      right: true,
      top: false,
      bottom: false,
    })
    expect(paddedSides({ x: -0.3, y: 0, width: 600.5, height: 400 }, 600, 952)).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: true,
    })
  })
})

/** Where canvas point (x, y) falls in the tile, in its texels, through the inverse of `m`. */
function inTile(m: Affine, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  const [dx, dy] = [x - e, y - f]
  return [(d * dx - c * dy) / det, (a * dy - b * dx) / det]
}

/** A tile whose every texel is a different colour. */
function numberedTile(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([i % 251, Math.floor(i / 251), 7, 255], i * 4)
  return { data, width, height }
}

const texelOf = (pixels: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) => {
  const wrap = (i: number, n: number) => ((Math.floor(i) % n) + n) % n
  const i = (wrap(y, pixels.height) * pixels.width + wrap(x, pixels.width)) * 4
  return [...pixels.data.subarray(i, i + 3)]
}

describe('fabricTransform', () => {
  const crop = { x: 31, y: 47, width: 60, height: 80 }
  const empty = (width: number, height: number) => new Uint8Array(width * height)
  const photo = { data: new Uint8ClampedArray(140 * 160 * 4), width: 140, height: 160 }

  it('lays a placed repeat in step with the photo, as tileAt fills its gaps', () => {
    const tile: FabricTile = {
      pixels: numberedTile(16, 12),
      width: 9.4,
      height: 7.3,
      wrap: 'repeat',
      placement: { origin: [57.3, 81.9], u: [9.31, 1.27], v: [-1.06, 7.23] },
    }
    // Every pixel of the crop is a gap, so it's all tile, laid as tileAt lays it.
    const filled = cropAndFill(photo, empty(140, 160), crop, tile)
    const drawn = { x: 113.7, y: 0, width: 432.6, height: 576.8 }
    const m = fabricTransform(tile, crop, drawn)
    const [kx, ky] = [drawn.width / crop.width, drawn.height / crop.height]
    for (const [px, py] of [[0, 0], [3, 5], [17, 11], [29, 40], [44, 63], [59, 79], [12, 71], [51, 2]]) {
      // The corner of photo pixel (px, py) on the canvas.
      const [x, y] = inTile(m, drawn.x + px * kx, drawn.y + py * ky)
      expect(texelOf(tile.pixels, x, y)).toEqual(texelOf(filled, px, py))
    }
  })

  it('repeats a plain sample from the crop corner, mirrored, at the photo scale', () => {
    const pixels = numberedTile(10, 10)
    const tile: FabricTile = { pixels, width: 10, height: 10, wrap: 'mirror' }
    const filled = cropAndFill(photo, empty(140, 160), crop, tile)
    const mirrored = mirroredTile(pixels)
    const drawn = { x: -20.5, y: 0, width: 120, height: 160 }
    const m = fabricTransform(tile, crop, drawn)
    for (const [px, py] of [[0, 0], [4, 9], [10, 10], [15, 3], [27, 33], [59, 79], [38, 61]]) {
      // The middle of photo pixel (px, py) on the canvas.
      const [x, y] = inTile(m, drawn.x + (px + 0.5) * 2, drawn.y + (py + 0.5) * 2)
      expect(texelOf(mirrored, x, y)).toEqual(texelOf(filled, px, py))
    }
  })
})

describe('mirroredTile', () => {
  it('lays the sample beside its mirror images', () => {
    const pixels = numberedTile(3, 2)
    const out = mirroredTile(pixels)
    expect([out.width, out.height]).toEqual([6, 4])
    const row = (y: number) => Array.from({ length: 6 }, (_, x) => texelOf(out, x, y)[0])
    expect(row(0)).toEqual([0, 1, 2, 2, 1, 0])
    expect(row(1)).toEqual([3, 4, 5, 5, 4, 3])
    expect(row(2)).toEqual(row(1))
    expect(row(3)).toEqual(row(0))
  })
})

describe('frontFit', () => {
  const crop = { width: 455, height: 905 }
  const panel = { width: 0.414, height: 0.645 }

  it('keeps a top in shape, at the scale it shows on the panel', () => {
    const { layout, pxPerMetre } = frontFit('shirt-long-sleeve', crop, panel)
    expect(layout).toEqual(frontLayout(crop, panel, frontScale(crop, panel.height)))
    expect(crop.width / layout.width).toBeCloseTo(pxPerMetre, 9)
    expect(crop.height / layout.height).toBeCloseTo(pxPerMetre, 9)
  })

  it('spreads a pair of trousers over the whole panel, so the legs land on the legs', () => {
    const trousers = { width: 334, height: 762 }
    const { layout, pxPerMetre } = frontFit('trousers-straight', trousers, { width: 0.4, height: 1.04 })
    expect(layout).toEqual({ x: 0, y: 0, width: 0.4, height: 1.04 })
    expect(pxPerMetre).toBeCloseTo(762 / 1.04, 9)
  })
})

describe('tileRepeat', () => {
  // A 454 x 905 px crop on a 0.42 x 0.65 m front panel.
  const crop = { width: 454, height: 905 }
  const panel = { width: 0.42, height: 0.65 }

  it('repeats a whole repeat of a pattern at one scale across and down, the one the front shows it at', () => {
    const pxPerMetre = frontScale(crop, panel.height)
    const square = { width: 120, height: 120, wrap: 'repeat' as const }
    const { wrap, repeat } = tileRepeat(square, crop, panel, pxPerMetre)
    expect(wrap).toBe(RepeatWrapping)
    // Turned over left to right, as the back and sleeves run the other way round to the front.
    expect(repeat[0]).toBeLessThan(0)
    // A square check is square on the back too.
    expect(-repeat[0]).toBeCloseTo(repeat[1], 9)
    // And the same size as on the front: one tile is as many metres as its photo pixels take up there.
    const front = frontLayout(crop, panel, pxPerMetre)
    expect(1 / repeat[1]).toBeCloseTo((120 / crop.height) * front.height, 9)
    expect(-1 / repeat[0]).toBeCloseTo((120 / crop.width) * front.width, 9)
  })

  it('sizes each way of an oblong repeat by its own length in the photo', () => {
    const { repeat } = tileRepeat({ width: 116.3, height: 121.1, wrap: 'repeat' }, crop, panel, 1400)
    expect(repeat[0]).toBeCloseTo(-1400 / 116.3, 9)
    expect(repeat[1]).toBeCloseTo(1400 / 121.1, 9)
  })

  it('mirrors a plain sample at the scale of the crop width, as before', () => {
    const { wrap, repeat } = tileRepeat({ width: 91, height: 91, wrap: 'mirror' }, crop, panel, 1400)
    expect(wrap).toBe(MirroredRepeatWrapping)
    expect(repeat[0]).toBeCloseTo(1 / ((91 / 454) * 0.42), 6)
    expect(repeat[1]).toBeCloseTo(repeat[0], 9)
  })
})
