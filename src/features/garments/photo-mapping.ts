import type { GarmentTemplateId } from './garment.types'

/*
 * Turning a garment photo into textures for a template, step by step:
 * find the background colour, separate the garment from it, pick the part of
 * the photo that corresponds to the template's front, and fill any background
 * showing through inside that area with the fabric's colour.
 *
 * Everything here works on plain RGBA pixel arrays (the shape of ImageData),
 * so it runs and tests without a browser canvas.
 */

export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type Rgb = [number, number, number]

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** How different two colours look; a cheap perceptual weighting of RGB distance. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const redMean = (a[0] + b[0]) / 2
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt((2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db)
}

function pixel(image: RgbaImage, x: number, y: number): Rgb {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
}

function alpha(image: RgbaImage, x: number, y: number) {
  return image.data[(y * image.width + x) * 4 + 3]
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * The photo's background colour: the median of the pixels around its edges.
 * Returns null for a cut-out whose edges are mostly transparent, where
 * transparency alone separates the garment.
 */
export function estimateBackground(image: RgbaImage): Rgb | null {
  const { width, height } = image
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.02))
  const channels: [number[], number[], number[]] = [[], [], []]
  let transparent = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onEdge = x < band || y < band || x >= width - band || y >= height - band
      if (!onEdge) continue
      if (alpha(image, x, y) < 128) {
        transparent++
        continue
      }
      const [r, g, b] = pixel(image, x, y)
      channels[0].push(r)
      channels[1].push(g)
      channels[2].push(b)
    }
  }
  if (transparent > channels[0].length) return null
  return [median(channels[0]), median(channels[1]), median(channels[2])]
}

export const DEFAULT_BACKGROUND_TOLERANCE = 70

/**
 * Marks garment pixels with 1: opaque and clearly different from the
 * background. Transparent pixels always count as background, and in a
 * cut-out (no background colour) every opaque pixel is garment.
 */
export function garmentMask(
  image: RgbaImage,
  background: Rgb | null,
  tolerance = DEFAULT_BACKGROUND_TOLERANCE,
): Uint8Array {
  const mask = new Uint8Array(image.width * image.height)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (alpha(image, x, y) < 128) continue
      if (!background || colorDistance(pixel(image, x, y), background) > tolerance) {
        mask[y * image.width + x] = 1
      }
    }
  }
  return mask
}

/**
 * The box around the garment. Rows and columns with only a sprinkle of
 * garment pixels (sensor noise, a stray thread) don't widen it.
 */
export function maskBounds(mask: Uint8Array, width: number, height: number): Rect | null {
  const rowCounts = new Array<number>(height).fill(0)
  const columnCounts = new Array<number>(width).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      rowCounts[y]++
      columnCounts[x]++
    }
  }
  const rowMinimum = Math.max(1, width * 0.004)
  const columnMinimum = Math.max(1, height * 0.004)
  const rows = rowCounts.flatMap((count, y) => (count > rowMinimum ? [y] : []))
  const columns = columnCounts.flatMap((count, x) => (count > columnMinimum ? [x] : []))
  if (rows.length === 0 || columns.length === 0) return null
  const x = columns[0]
  const y = rows[0]
  return { x, y, width: columns[columns.length - 1] - x + 1, height: rows[rows.length - 1] - y + 1 }
}

/**
 * Shrinks the garment region by `radius` pixels on every side. Edge pixels
 * blend garment and background, so they're left out of anything sampled or
 * shown, and get filled like the rest of the background.
 */
export function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice()
  const span = radius * 2 + 1

  // A pixel survives a pass if every pixel within `radius` along that axis is garment.
  function pass(source: Uint8Array, length: number, lines: number, index: (line: number, i: number) => number) {
    const result = new Uint8Array(source.length)
    const ones = new Int32Array(length + 1)
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < length; i++) ones[i + 1] = ones[i] + source[index(line, i)]
      for (let i = 0; i < length; i++) {
        const inside = ones[Math.min(i + radius + 1, length)] - ones[Math.max(i - radius, 0)]
        if (inside === span) result[index(line, i)] = 1
      }
    }
    return result
  }

  const rows = pass(mask, width, height, (y, x) => y * width + x)
  return pass(rows, height, width, (x, y) => y * width + x)
}

/** The unbroken run of garment pixels on a row that contains, or is nearest to, `centre`. */
function runNear(mask: Uint8Array, width: number, row: number, centre: number) {
  const at = (x: number) => mask[row * width + x] === 1
  let start = Math.round(centre)
  if (!at(start)) {
    let offset = 1
    while (offset < width && !at(start - offset) && !at(start + offset)) offset++
    if (offset >= width) return null
    start = at(start - offset) ? start - offset : start + offset
  }
  let left = start
  let right = start
  while (left > 0 && at(left - 1)) left--
  while (right < width - 1 && at(right + 1)) right++
  return { left, right }
}

/**
 * The body of a top, without its sleeves: as wide as the hem, which sleeves
 * never reach, and as tall as the whole garment.
 */
export function torsoRect(mask: Uint8Array, width: number, bounds: Rect): Rect {
  const centre = bounds.x + bounds.width / 2
  const runs = [0.86, 0.9, 0.94].flatMap((fraction) => {
    const row = Math.round(bounds.y + fraction * (bounds.height - 1))
    const run = runNear(mask, width, row, centre)
    return run ? [run] : []
  })
  if (runs.length === 0) return bounds
  const left = median(runs.map((run) => run.left))
  const right = median(runs.map((run) => run.right))
  return { x: left, y: bounds.y, width: right - left + 1, height: bounds.height }
}

/** The part of the photo that is projected onto the template's front panel. */
export function frontCrop(templateId: GarmentTemplateId, mask: Uint8Array, width: number, bounds: Rect): Rect {
  return templateId === 'trousers-straight' ? bounds : torsoRect(mask, width, bounds)
}

/**
 * A square of plain fabric to tile over the back and sleeves: taken low on
 * the wearer's right, away from a shirt's buttons and chest pocket, or from
 * the thigh of the left leg in a pair of trousers.
 */
export function swatchRect(templateId: GarmentTemplateId, crop: Rect): Rect {
  const size = Math.max(1, Math.round(Math.min(crop.width, crop.height) * 0.24))
  const top = templateId === 'trousers-straight' ? 0.3 : 0.58
  const x = Math.min(crop.x + Math.round(crop.width * 0.14), crop.x + crop.width - size)
  const y = Math.min(crop.y + Math.round(crop.height * top), crop.y + crop.height - size)
  return { x, y, width: size, height: size }
}

/** Average colour of the garment pixels inside `rect` (or of all of it, if none are garment). */
export function averageColor(image: RgbaImage, mask: Uint8Array, rect: Rect): Rgb {
  const sums = { garment: [0, 0, 0, 0], all: [0, 0, 0, 0] }
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const [r, g, b] = pixel(image, x, y)
      const target = mask[y * image.width + x] ? [sums.garment, sums.all] : [sums.all]
      for (const sum of target) {
        sum[0] += r
        sum[1] += g
        sum[2] += b
        sum[3]++
      }
    }
  }
  const use = sums.garment[3] > 0 ? sums.garment : sums.all
  const count = Math.max(1, use[3])
  return [Math.round(use[0] / count), Math.round(use[1] / count), Math.round(use[2] / count)]
}

/** Share of `rect` covered by garment pixels; low values mean the garment wasn't found cleanly. */
export function coverage(mask: Uint8Array, width: number, rect: Rect): number {
  let garment = 0
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) garment += mask[y * width + x]
  }
  return garment / Math.max(1, rect.width * rect.height)
}

/** Mirrors `i` back and forth across `length`, so a tile repeats without hard seams. */
function mirrored(i: number, length: number) {
  const period = length * 2
  const wrapped = ((i % period) + period) % period
  return wrapped < length ? wrapped : period - 1 - wrapped
}

/**
 * Copies `rect` out of the photo, painting any background inside it so gaps
 * (a shirt's neck opening, the space between trouser legs) don't end up on
 * the mannequin. `fill` is either a flat colour or a fabric sample, which is
 * tiled so a pattern carries on through the gap.
 */
export function cropAndFill(
  image: RgbaImage,
  mask: Uint8Array,
  rect: Rect,
  fill: Rgb | RgbaImage,
): RgbaImage {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const source = (rect.y + y) * image.width + rect.x + x
      const target = (y * rect.width + x) * 4
      if (mask[source] === 1) {
        data.set(image.data.subarray(source * 4, source * 4 + 3), target)
      } else if (Array.isArray(fill)) {
        data.set(fill, target)
      } else {
        const tile = (mirrored(y, fill.height) * fill.width + mirrored(x, fill.width)) * 4
        data.set(fill.data.subarray(tile, tile + 3), target)
      }
      data[target + 3] = 255
    }
  }
  return { data, width: rect.width, height: rect.height }
}
