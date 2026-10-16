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


/** Calls `visit` for each of a pixel's four direct neighbours that lie inside the image. */
function forNeighbours(i: number, width: number, height: number, visit: (j: number) => void) {
  const x = i % width
  if (x > 0) visit(i - 1)
  if (x < width - 1) visit(i + 1)
  if (i >= width) visit(i - width)
  if (i < width * (height - 1)) visit(i + width)
}

/**
 * Keeps only the biggest connected patch of garment pixels, dropping props
 * laid beside the garment and specks of busy background.
 */
export function largestComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const labels = new Int32Array(mask.length)
  const queue = new Int32Array(mask.length)
  let label = 0
  let best = 0
  let bestSize = 0
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue
    label++
    let head = 0
    let tail = 0
    labels[start] = label
    queue[tail++] = start
    while (head < tail) {
      forNeighbours(queue[head++], width, height, (j) => {
        if (mask[j] && !labels[j]) {
          labels[j] = label
          queue[tail++] = j
        }
      })
    }
    if (tail > bestSize) {
      bestSize = tail
      best = label
    }
  }
  const result = new Uint8Array(mask.length)
  if (best === 0) return result
  for (let i = 0; i < mask.length; i++) if (labels[i] === best) result[i] = 1
  return result
}

/** Percentile of an unsorted list, without mutating it. */
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

/**
 * How much the backdrop varies, read along the photo's outermost pixels:
 * `spread` is how far most edge pixels stray from the backdrop colour, and
 * `roughness` is the typical change from one edge pixel to the next.
 */
export function backdropVariation(image: RgbaImage, background: Rgb) {
  const { width, height } = image
  const ring: Rgb[] = []
  for (let x = 0; x < width; x++) ring.push(pixel(image, x, 0))
  for (let y = 1; y < height; y++) ring.push(pixel(image, width - 1, y))
  for (let x = width - 2; x >= 0; x--) ring.push(pixel(image, x, height - 1))
  for (let y = height - 2; y > 0; y--) ring.push(pixel(image, 0, y))
  const fromBackdrop = ring.map((color) => colorDistance(color, background))
  const steps = ring.slice(1).map((color, i) => colorDistance(color, ring[i]))
  return { spread: percentile(fromBackdrop, 0.9), roughness: percentile(steps, 0.75) }
}

/**
 * Marks garment pixels with 1. The background is grown inwards from the
 * photo's edges: it steps across gentle changes (a shadow, a gradient
 * backdrop) but stops at the sharp change where the garment starts, and it
 * never strays far from the backdrop's colour. Anything it can't reach, such
 * as a dark check on a dark backdrop that the garment encloses, counts as
 * garment. Only the largest patch of garment is kept.
 *
 * In a cut-out (no background colour) transparency alone decides.
 */
export function garmentMask(
  image: RgbaImage,
  background: Rgb | null,
  tolerance = DEFAULT_BACKGROUND_TOLERANCE,
): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  const isBackground = new Uint8Array(total)
  const transparent = (i: number) => data[i * 4 + 3] < 128

  if (!background) {
    for (let i = 0; i < total; i++) if (transparent(i)) isBackground[i] = 1
  } else {
    const rgb = (i: number): Rgb => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
    // A busy backdrop (concrete, wood grain) needs more slack than a plain
    // one, so loosen both limits to match how much the edges themselves vary.
    const { spread, roughness } = backdropVariation(image, background)
    const step = Math.max(tolerance / 3, roughness * 3)
    const range = Math.max(tolerance * 2, spread * 1.25)
    const nearBackdrop = (i: number) => colorDistance(rgb(i), background) <= range
    const queue = new Int32Array(total)
    let head = 0
    let tail = 0
    const add = (i: number) => {
      isBackground[i] = 1
      queue[tail++] = i
    }

    for (let x = 0; x < width; x++) {
      for (const i of [x, (height - 1) * width + x]) {
        if (!isBackground[i] && (transparent(i) || nearBackdrop(i))) add(i)
      }
    }
    for (let y = 0; y < height; y++) {
      for (const i of [y * width, y * width + width - 1]) {
        if (!isBackground[i] && (transparent(i) || nearBackdrop(i))) add(i)
      }
    }

    while (head < tail) {
      const from = queue[head++]
      const here = rgb(from)
      forNeighbours(from, width, height, (j) => {
        if (isBackground[j]) return
        if (transparent(j) || (colorDistance(rgb(j), here) <= step && nearBackdrop(j))) add(j)
      })
    }
  }

  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) mask[i] = isBackground[i] ? 0 : 1
  return largestComponent(mask, width, height)
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
  const trousers = templateId === 'trousers-straight'
  // A trouser leg is under half the crop's width, so its sample is smaller and further in.
  const size = Math.max(1, Math.round(Math.min(crop.width, crop.height) * (trousers ? 0.2 : 0.24)))
  const x = Math.min(crop.x + Math.round(crop.width * (trousers ? 0.08 : 0.14)), crop.x + crop.width - size)
  const y = Math.min(crop.y + Math.round(crop.height * (trousers ? 0.3 : 0.58)), crop.y + crop.height - size)
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
