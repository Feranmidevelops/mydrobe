import { describe, expect, it, vi } from 'vitest'
import type { GarmentTemplateId } from './garment.types'
import { latticeTile, type FabricTile } from './pattern-tile'
import { fabricRepeat } from './photo-analysis'
import {
  chooseSwatch,
  erodeMask,
  estimateBackground,
  frontCrop,
  garmentMask,
  maskBounds,
  type Rgb,
  type RgbaImage,
} from './photo-mapping'

/*
 * Synthetic garments with a known repeat, as the lattice search was tested
 * on when it was chosen: a 900 x 1200 T-shirt or pair of trousers on a light
 * grey backdrop, woven in a 2/2 twill, with seeded noise, a slight turn,
 * light falling across it and soft folds.
 */

interface Fabric {
  pattern: 'buffalo' | 'plaid' | 'stripe' | 'hstripe' | 'gingham' | 'houndstooth' | 'tonal-check' | 'tonal-stripe' | 'plain' | 'plain-print'
  /** The true repeat across (u) and down (v) the fabric, in pixels. */
  px: number
  py: number
  /** Standard deviation of the noise added to each channel. */
  noise?: number
  /** How far the fabric is turned, in degrees. */
  angle?: number
  /** Light falling across the garment, brighter to the right. */
  gradient?: boolean
  /** Five soft, irregular folds. */
  folds?: boolean
  /** Evenly spaced soft folds: their spacing in pixels and how deep they shade. */
  sine?: [number, number]
  trousers?: boolean
}

/** Mulberry32: a small seeded random number generator, so every run makes the same photo. */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The colour at `phase` (0 to 1) across a sett: bands given as [width, colour]. */
function sett(bands: [number, Rgb][], phase: number): Rgb {
  const total = bands.reduce((sum, [width]) => sum + width, 0)
  let p = phase * total
  for (const [width, color] of bands) {
    if (p < width) return color
    p -= width
  }
  return bands[bands.length - 1][1]
}

const frac = (value: number) => value - Math.floor(value)

const NAVY: Rgb = [30, 40, 90]
const GREEN: Rgb = [40, 110, 60]
const WHITE: Rgb = [230, 230, 220]

// An asymmetric plaid, so a mirrored tile would show a false symmetry.
const PLAID_WARP: [number, Rgb][] = [
  [20, NAVY],
  [6, GREEN],
  [4, WHITE],
  [14, GREEN],
  [8, [180, 40, 40]],
  [15, NAVY],
]
const PLAID_WEFT: [number, Rgb][] = [
  [12, NAVY],
  [5, [200, 180, 60]],
  [18, GREEN],
  [3, WHITE],
  [21, NAVY],
]

const HOUNDSTOOTH = ['11110000', '11100001', '11000011', '10000111', '11110000', '01110000', '00110000', '00010000']

/** The fabric's colour at (u, v) in its own coordinates; a 2/2 twill shows the warp or the weft. */
function fabricColor(fabric: Fabric, u: number, v: number): Rgb {
  const { px, py } = fabric
  const twill = ((Math.floor(u / 2) + Math.floor(v / 2)) & 3) < 2
  switch (fabric.pattern) {
    case 'buffalo': {
      const warp: Rgb = frac(u / px) < 0.5 ? [25, 25, 28] : [150, 30, 35]
      const weft: Rgb = frac(v / py) < 0.5 ? [25, 25, 28] : [150, 30, 35]
      return twill ? warp : weft
    }
    case 'plaid':
      return twill ? sett(PLAID_WARP, frac(u / px)) : sett(PLAID_WEFT, frac(v / py))
    case 'stripe':
      return frac(u / px) < 0.28 ? [235, 238, 245] : [60, 95, 170]
    case 'hstripe':
      return frac(v / py) < 0.28 ? [235, 238, 245] : [60, 95, 170]
    case 'gingham': {
      const a = frac(u / px) < 0.5
      const b = frac(v / py) < 0.5
      return a && b ? [40, 70, 150] : a || b ? [140, 160, 210] : [240, 242, 248]
    }
    case 'houndstooth':
      return HOUNDSTOOTH[Math.floor(frac(v / py) * 8)][Math.floor(frac(u / px) * 8)] === '1' ? [25, 25, 25] : [225, 220, 205]
    case 'tonal-check': {
      // One brown in three shades 3% apart: a low-contrast check with no change of hue.
      const shade = 1 + 0.03 * ((frac(u / px) < 0.5 ? 1 : -1) + (frac(v / py) < 0.5 ? 1 : -1))
      return [120 * shade, 90 * shade, 70 * shade]
    }
    case 'tonal-stripe': {
      // Navy stripes a little lighter than the navy between them.
      const shade = frac(u / px) < 0.4 ? 1.0875 : 0.95
      return [40 * shade, 60 * shade, 120 * shade]
    }
    default:
      return [70, 110, 160]
  }
}

/** A photo of a garment made of `fabric`, 900 x 1200, its fabric turned about (450, 650). */
function synthGarment(fabric: Fabric): RgbaImage {
  const W = 900
  const H = 1200
  const data = new Uint8ClampedArray(W * H * 4)
  const rnd = random(7)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const th = ((fabric.angle ?? 0) * Math.PI) / 180
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  const folds: { a: number; b: number; c: number; w: number; d: number }[] = []
  if (fabric.folds) {
    for (let i = 0; i < 5; i++) {
      const angle = (rnd() - 0.5) * 1.2 + Math.PI / 2
      folds.push({ a: Math.cos(angle), b: Math.sin(angle), c: 200 + rnd() * 500, w: 15 + rnd() * 35, d: 0.25 + rnd() * 0.25 })
    }
  }
  const inTrousers = (x: number, y: number) => {
    if (y < 150 || y >= 1150) return false
    if (y < 400) return x >= 250 && x < 650
    const spread = ((y - 400) / 750) * 40
    return (x >= 250 - spread && x < 440 - spread * 0.2) || (x >= 460 + spread * 0.2 && x < 650 + spread)
  }
  const inShirt = (x: number, y: number) => {
    const body = x >= 210 && x < 690 && y >= 230 && y < 1160
    const sleeve = y >= 230 && y < 230 + (x < 210 ? (x - 70) * 1.6 : (830 - x) * 1.6) && x >= 70 && x < 830 && y < 620
    const shoulders = y >= 200 && y < 230 && x >= 250 && x < 650 && !(x > 400 && x < 500 && y < 225)
    return body || sleeve || shoulders
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let color: Rgb
      if (!(fabric.trousers ? inTrousers(x, y) : inShirt(x, y))) {
        color = [205, 205, 210]
      } else {
        const dx = x - 450
        const dy = y - 650
        color = fabricColor(fabric, cos * dx + sin * dy + 1000, -sin * dx + cos * dy + 1000)
        let gain = 1
        if (fabric.gradient) gain *= 0.7 + 0.55 * (x / W) + 0.1 * (y / H)
        if (fabric.sine) gain *= 1 - fabric.sine[1] * (0.5 + 0.5 * Math.sin((2 * Math.PI * (x + 0.3 * y)) / fabric.sine[0]))
        for (const f of folds) {
          const distance = f.a * x + f.b * y - f.c
          gain *= 1 - f.d * Math.exp(-(distance * distance) / (2 * f.w * f.w))
        }
        color = [color[0] * gain, color[1] * gain, color[2] * gain]
        if (fabric.noise) {
          const noise = fabric.noise
          color = [color[0] + gauss() * noise, color[1] + gauss() * noise, color[2] + gauss() * noise]
        }
      }
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = 255
    }
  }
  if (fabric.pattern === 'plain-print') {
    // A big two-colour graphic on the chest: a ring and blocky letters.
    for (let y = 350; y < 800; y++) {
      for (let x = 300; x < 600; x++) {
        const r = Math.hypot(x - 450, y - 500)
        const ring = r > 90 && r < 120
        const letters = y > 680 && y < 760 && (x - 300) % 50 < 30 && ((y - 680) % 40 < 25 || (x - 300) % 50 < 10)
        if (ring || letters) data.set([240, 235, 220], (y * W + x) * 4)
      }
    }
  }
  return { data, width: W, height: H }
}

/** Noise, a 2 degree turn, light falling across and soft folds: everything a real photo has. */
const TROUBLE = { noise: 12, angle: 2, gradient: true, folds: true }

/** The photo pipeline up to the plain sample, as analyseGarmentPhoto runs it. */
function sampleOf(image: RgbaImage, templateId: GarmentTemplateId) {
  const mask = garmentMask(image, estimateBackground(image))
  const bounds = maskBounds(mask, image.width, image.height)
  if (!bounds) throw new Error('No garment in the synthetic photo.')
  const crop = frontCrop(templateId, mask, image.width, bounds)
  const edge = Math.max(1, Math.round(Math.min(image.width, image.height) * 0.004))
  const solid = erodeMask(mask, image.width, image.height, edge)
  const swatch = chooseSwatch(templateId, image, solid, crop)
  return { solid, crop, swatch }
}

/** The lattice tile for a photo, as analyseGarmentPhoto finds it. */
function tileFor(image: RgbaImage, templateId: GarmentTemplateId) {
  const { solid, crop, swatch } = sampleOf(image, templateId)
  return fabricRepeat(templateId, image, solid, crop, swatch)
}

const tiles = new Map<string, FabricTile | null>()

/** The lattice tile for a garment of `fabric`, worked out once, as each takes about a second. */
function tileOf(fabric: Fabric) {
  const key = JSON.stringify(fabric)
  if (!tiles.has(key)) tiles.set(key, tileFor(synthGarment(fabric), fabric.trousers ? 'trousers-straight' : 'shirt-long-sleeve'))
  return tiles.get(key)!
}

/** A tile that must have been found. */
function found(tile: FabricTile | null): FabricTile {
  expect(tile).not.toBeNull()
  expect(tile!.wrap).toBe('repeat')
  return tile!
}

/** How far `size` is from `repeat`, as a share. */
const off = (size: number, repeat: number) => Math.abs(size / repeat - 1)

/** Each texel's lightness, row by row. */
function lightness({ data, width, height }: RgbaImage) {
  return Float64Array.from({ length: width * height }, (_, k) => 0.299 * data[k * 4] + 0.587 * data[k * 4 + 1] + 0.114 * data[k * 4 + 2])
}

function correlation(a: Float64Array, b: Float64Array) {
  const n = a.length
  const ma = a.reduce((sum, x) => sum + x, 0) / n
  const mb = b.reduce((sum, x) => sum + x, 0) / n
  let ab = 0
  let aa = 0
  let bb = 0
  for (let k = 0; k < n; k++) {
    ab += (a[k] - ma) * (b[k] - mb)
    aa += (a[k] - ma) ** 2
    bb += (b[k] - mb) ** 2
  }
  return ab / Math.sqrt(aa * bb)
}

/**
 * How far, in degrees, the stripes in a stripe tile lean off the fabric's
 * own, given how far the fabric is turned. The tile's edge along the stripes
 * (v for stripes down the photo, u for stripes across it) is where it lays
 * them.
 */
function stripeLean(tile: FabricTile, fabric: Fabric) {
  const across = fabric.pattern === 'hstripe'
  const [x, y] = across ? tile.placement!.u : tile.placement!.v
  return (Math.atan2(y, x) * 180) / Math.PI - (fabric.angle ?? 0) - (across ? 0 : 90)
}

/** The largest step in any channel between a texel and the one at the start of its line along the stripes. */
function unevenAlongStripes({ data, width, height }: RgbaImage, acrossPhoto: boolean) {
  let largest = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const first = acrossPhoto ? y * width : x
      for (let c = 0; c < 3; c++) largest = Math.max(largest, Math.abs(data[(y * width + x) * 4 + c] - data[first * 4 + c]))
    }
  }
  return largest
}

/** A 1200 x 1200 close-up the plaid fills, bar a thin rim of backdrop. */
function fullFramePhoto(): RgbaImage {
  const W = 1200
  const H = 1200
  const data = new Uint8ClampedArray(W * H * 4)
  const rnd = random(11)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rim = x < 10 || y < 10 || x >= W - 10 || y >= H - 10
      const color = rim ? [205, 205, 210] : fabricColor(PLAID, x + 1000, y + 1000).map((c) => c + gauss() * 6)
      data.set([...color, 255], (y * W + x) * 4)
    }
  }
  return { data, width: W, height: H }
}

/** Mean lightness of each band of a tile, `bands` of them from top to bottom. */
function bandLightness(pixels: RgbaImage, bands: number) {
  const light = lightness(pixels)
  return Array.from({ length: bands }, (_, b) => {
    const top = Math.round((b * pixels.height) / bands)
    const bottom = Math.round(((b + 1) * pixels.height) / bands)
    return light.slice(top * pixels.width, bottom * pixels.width).reduce((sum, x) => sum + x, 0) / ((bottom - top) * pixels.width)
  })
}

/*
 * The photos go in as made, pixel-sharp, with no JPEG round trip (that needs
 * a canvas). The lattice search was first tuned on JPEG-compressed photos,
 * which soften the fine detail and colour noise these keep, so they're the
 * harder test.
 */
const PLAID: Fabric = { pattern: 'plaid', px: 67, py: 59, ...TROUBLE }

describe('latticeTile', () => {
  it('tiles a clean buffalo check at its repeat', () => {
    const tile = found(tileOf({ pattern: 'buffalo', px: 96, py: 96 }))
    expect(Math.abs(tile.width - 96)).toBeLessThanOrEqual(0.6)
    expect(Math.abs(tile.height - 96)).toBeLessThanOrEqual(0.6)
  })

  it('finds a buffalo check through noise, folds and uneven light, turned as the fabric is', () => {
    const tile = found(tileOf({ pattern: 'buffalo', px: 131, py: 131, ...TROUBLE }))
    expect(off(tile.width, 131)).toBeLessThanOrEqual(0.01)
    expect(off(tile.height, 131)).toBeLessThanOrEqual(0.01)
    const [ux, uy] = tile.placement!.u
    expect(Math.abs((Math.atan2(uy, ux) * 180) / Math.PI - 2)).toBeLessThanOrEqual(0.25)
  })

  // The coarse search reads three repeats down as one, so the tile holds
  // 3 x 3 repeats (201.02 x 177.12 px). Any whole number each way wraps
  // seamlessly and keeps the plaid's scale, so that's what's asked.
  it('tiles an asymmetric plaid in whole repeats across and down', () => {
    const tile = found(tileOf(PLAID))
    expect(off(tile.width / Math.round(tile.width / 67), 67)).toBeLessThanOrEqual(0.005)
    expect(off(tile.height / Math.round(tile.height / 59), 59)).toBeLessThanOrEqual(0.005)
  })

  // The three best repeats folded here all lack the same strip, cut off by
  // the top of the shirt, which used to leave an unfilled band in the tile.
  it('fills every repeat of the tile, even where the best ones all miss the same strip', () => {
    const tile = found(tileOf(PLAID))
    const bands = bandLightness(tile.pixels, Math.round(tile.height / 59))
    expect(bands.length).toBeGreaterThan(1)
    expect((Math.max(...bands) - Math.min(...bands)) / Math.max(...bands)).toBeLessThan(0.12)
  })

  it('keeps an asymmetric plaid the right way round, and seamless', () => {
    const tile = found(tileOf(PLAID))
    const { width, height } = tile.pixels
    const light = lightness(tile.pixels)
    const flipped = Float64Array.from(light, (_, k) => light[Math.floor(k / width) * width + width - 1 - (k % width)])
    expect(correlation(light, flipped)).toBeLessThan(0.6)

    // The step from the last column round to the first is no bigger than the steps inside.
    let wrapStep = 0
    let insideStep = 0
    for (let y = 0; y < height; y++) {
      wrapStep += Math.abs(light[y * width] - light[y * width + width - 1])
      for (let x = 0; x < width - 1; x++) insideStep += Math.abs(light[y * width + x + 1] - light[y * width + x])
    }
    expect(wrapStep / height).toBeLessThanOrEqual(1.5 * (insideStep / (height * (width - 1))))
  })

  it('finds a big 165 px check', () => {
    const tile = found(tileOf({ pattern: 'buffalo', px: 165, py: 165, ...TROUBLE }))
    expect(off(tile.width, 165)).toBeLessThanOrEqual(0.015)
    expect(off(tile.height, 165)).toBeLessThanOrEqual(0.015)
  })

  it('tiles stripes 7.3 px apart a whole number of stripes wide', () => {
    const tile = found(tileOf({ pattern: 'stripe', px: 7.3, py: 7.3, ...TROUBLE }))
    expect(off(tile.width / Math.round(tile.width / 7.3), 7.3)).toBeLessThanOrEqual(0.003)
  })

  // These were once left to the plain sample: their cells were lined up a
  // few degrees off the stripes, which washed the fold out (it kept 0.59 of
  // their contrast). Lined up straight, it keeps 0.88.
  it('tiles stripes 3.6 px apart straight, a whole number of stripes wide', () => {
    const fabric: Fabric = { pattern: 'stripe', px: 3.6, py: 3.6, ...TROUBLE }
    const tile = found(tileOf(fabric))
    expect(off(tile.width / Math.round(tile.width / 3.6), 3.6)).toBeLessThanOrEqual(0.003)
    expect(Math.abs(stripeLean(tile, fabric))).toBeLessThanOrEqual(0.5)
  })

  // Stripes a few pixels apart look alike moved straight along them or a
  // stripe over, so their direction is measured rather than picked from a
  // few trial shifts. Picked, ties went to the first of 82.5, 90 and 97.5
  // degrees, and these came out leaning 1.4 to 15 degrees: diagonal or
  // sawtooth stripes on the back and sleeves.
  it.each<[string, Fabric]>([
    ['4 px apart', { pattern: 'stripe', px: 4, py: 4, ...TROUBLE }],
    ['9 px apart', { pattern: 'stripe', px: 9, py: 9, ...TROUBLE }],
    ['9 px apart across the shirt', { pattern: 'hstripe', px: 9, py: 9, ...TROUBLE }],
  ])('keeps fine stripes %s, turned 2 degrees, straight in the tile', (_, fabric) => {
    const tile = found(tileOf(fabric))
    expect(off(tile.stripes! / Math.round(tile.stripes! / fabric.px), fabric.px)).toBeLessThanOrEqual(0.005)
    expect(Math.abs(stripeLean(tile, fabric))).toBeLessThanOrEqual(0.5)
  })

  // The coarse search reads these as a grid 54 px across, the stripes' own
  // lattice with a slanted edge. The check for stripes read at a slant used
  // to look at lightness softened for that 54 px repeat, which wiped the
  // stripes out, so the slanted grid passed.
  it('takes stripes 7.7 px apart, turned 1 degree, as stripes rather than a slanted grid', () => {
    const fabric: Fabric = { pattern: 'stripe', px: 7.7, py: 7.7, noise: 6, angle: 1, gradient: true, folds: true }
    const tile = found(tileOf(fabric))
    expect(tile.stripes).toBeDefined()
    expect(off(tile.stripes!, 7.7)).toBeLessThanOrEqual(0.005)
    expect(Math.abs(stripeLean(tile, fabric))).toBeLessThanOrEqual(0.5)
  })

  // Stripes have no pattern along them. A fold or the light can leave a
  // little in the few repeats folded, and repeated exactly cell after cell it
  // showed as faint bars across the stripes.
  it.each<[string, Fabric]>([
    ['down the photo', { pattern: 'stripe', px: 7.3, py: 7.3, ...TROUBLE }],
    ['across it', { pattern: 'hstripe', px: 9, py: 9, ...TROUBLE }],
  ])('lays a stripe tile out alike all along its stripes, for stripes %s', (_, fabric) => {
    const tile = found(tileOf(fabric))
    expect(unevenAlongStripes(tile.pixels, fabric.pattern === 'hstripe')).toBeLessThanOrEqual(1)
  })

  // The colour sums behind the coarse grids used to cover the whole crop: on
  // a close-up, four tables of 11 MB each, though every window looked in sits
  // within 480 px or so of the sample.
  it('keeps its working arrays smaller than the crop when the garment fills the photo', () => {
    const image = fullFramePhoto()
    const { solid, crop, swatch } = sampleOf(image, 'shirt-long-sleeve')
    let largest = 0
    for (const name of ['Float64Array', 'Float32Array', 'Int32Array'] as const) {
      const Base = globalThis[name] as unknown as new (...args: unknown[]) => { byteLength: number }
      vi.stubGlobal(
        name,
        class extends Base {
          constructor(...args: unknown[]) {
            super(...args)
            largest = Math.max(largest, this.byteLength)
          }
        },
      )
    }
    let tile: FabricTile | null
    try {
      tile = latticeTile(image, solid, crop, swatch)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(crop.width * crop.height).toBeGreaterThan(1000 * 1000)
    found(tile)
    expect(largest).toBeLessThan((crop.width + 1) * (crop.height + 1) * Int32Array.BYTES_PER_ELEMENT)
  })

  it.each<[string, Fabric]>([
    ['with noise', { pattern: 'plain', px: 0, py: 0, noise: 8 }],
    ['with folds and uneven light', { pattern: 'plain', px: 0, py: 0, noise: 6, folds: true, gradient: true }],
    ['with even folds 90 px apart', { pattern: 'plain', px: 0, py: 0, noise: 6, sine: [90, 0.2] }],
    ['with even folds 60 px apart and uneven light', { pattern: 'plain', px: 0, py: 0, sine: [60, 0.12], gradient: true }],
    // Noise on every channel used to pass for colour (a chromaticity spread
    // of 0.0105), so these folds were tiled as stripes 57.4 px apart.
    ['with even folds 60 px apart, uneven light and noise', { pattern: 'plain', px: 0, py: 0, noise: 4, sine: [60, 0.12], gradient: true }],
    ['with a printed graphic', { pattern: 'plain-print', px: 0, py: 0, noise: 6, gradient: true }],
  ])('finds no lattice in plain fabric %s', (_, fabric) => {
    expect(tileOf(fabric)).toBeNull()
  })

  // Folds look the same however much noise the photo has, so the shading
  // test mustn't depend on it.
  it.each([50, 60, 90].flatMap((spacing) => [0, 4, 8].map((noise) => [spacing, noise])))(
    'finds no lattice in plain fabric with even folds %i px apart, uneven light and noise %i',
    (spacing, noise) => {
      // No noise is left out, so the folds 60 px apart above are made once.
      expect(tileOf({ pattern: 'plain', px: 0, py: 0, noise: noise || undefined, sine: [spacing, 0.12], gradient: true })).toBeNull()
    },
  )

  // A pattern in one colour has no chromaticity to tell it from folds; its
  // edges must, as these sharp shades are no sinusoid.
  it('tiles a low-contrast check in shades of one colour', () => {
    const tile = found(tileOf({ pattern: 'tonal-check', px: 48, py: 48, noise: 8, angle: 2, gradient: true }))
    expect(off(tile.width, 48)).toBeLessThanOrEqual(0.005)
    expect(off(tile.height, 48)).toBeLessThanOrEqual(0.005)
  })

  it('tiles stripes in shades of one colour a whole number of stripes wide', () => {
    const tile = found(tileOf({ pattern: 'tonal-stripe', px: 40, py: 40, noise: 8, angle: 2, gradient: true }))
    expect(off(tile.width / Math.round(tile.width / 40), 40)).toBeLessThanOrEqual(0.003)
  })

  it('tiles trousers in a 60 px gingham', () => {
    const tile = found(tileOf({ pattern: 'gingham', px: 60, py: 60, ...TROUBLE, trousers: true }))
    expect(off(tile.width, 60)).toBeLessThanOrEqual(0.005)
    expect(off(tile.height, 60)).toBeLessThanOrEqual(0.005)
  })

  // The garment mask takes in the backdrop between the legs, a plain band
  // that makes this plaid read as stripes 68.2 px apart across both legs; one
  // leg on its own shows the plaid.
  it.each([0, 6, 12])('tiles trousers in a 67 x 59 px plaid one repeat across and down, with noise %i', (noise) => {
    const tile = found(tileOf({ ...PLAID, noise, trousers: true }))
    expect(off(tile.width, 67)).toBeLessThanOrEqual(0.01)
    expect(off(tile.height, 59)).toBeLessThanOrEqual(0.01)
  })

  it('tiles a houndstooth', () => {
    const tile = found(tileOf({ pattern: 'houndstooth', px: 36, py: 36, ...TROUBLE }))
    expect(off(tile.width, 36)).toBeLessThanOrEqual(0.003)
    expect(off(tile.height, 36)).toBeLessThanOrEqual(0.003)
  })
})
