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
  return largestComponent(tidyMask(mask, width, height), width, height)
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
  return morph(mask, width, height, radius, 'erode')
}

/** Grows the garment region by `radius` pixels on every side. */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return morph(mask, width, height, radius, 'dilate')
}

/**
 * Square erosion or dilation, done as two quick passes (rows, then columns).
 * Outside the image counts as background either way.
 */
function morph(mask: Uint8Array, width: number, height: number, radius: number, mode: 'erode' | 'dilate') {
  if (radius <= 0) return mask.slice()
  const span = radius * 2 + 1

  // Erosion keeps a pixel only if its whole window is garment; dilation if any of it is.
  function pass(source: Uint8Array, length: number, lines: number, index: (line: number, i: number) => number) {
    const result = new Uint8Array(source.length)
    const ones = new Int32Array(length + 1)
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < length; i++) ones[i + 1] = ones[i] + source[index(line, i)]
      for (let i = 0; i < length; i++) {
        const inside = ones[Math.min(i + radius + 1, length)] - ones[Math.max(i - radius, 0)]
        if (mode === 'erode' ? inside === span : inside > 0) result[index(line, i)] = 1
      }
    }
    return result
  }

  const rows = pass(mask, width, height, (y, x) => y * width + x)
  return pass(rows, height, width, (x, y) => y * width + x)
}

/**
 * Tidies a raw garment mask: an opening removes thin attachments such as a
 * hanger hook or rail, and a closing fills notches along the edge, such as
 * dark checks that merged into a dark backdrop.
 */
export function tidyMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const thin = Math.max(1, Math.round(Math.min(width, height) * 0.008))
  const gap = Math.max(1, Math.round(Math.max(width, height) * 0.025))
  const opened = dilateMask(erodeMask(mask, width, height, thin), width, height, thin)
  return erodeMask(dilateMask(opened, width, height, gap), width, height, gap)
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

/** The garment's balance point across the photo, which a stray rail or strap can't drag far. */
function massCentreX(mask: Uint8Array, width: number, bounds: Rect) {
  let sum = 0
  let count = 0
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (!mask[y * width + x]) continue
      sum += x
      count++
    }
  }
  return count > 0 ? sum / count : bounds.x + bounds.width / 2
}

/** How far a collar rises above the shoulders, as a share of the shoulders' height above the hem. */
export const COLLAR_RISE = 0.08

/**
 * The row where a top's shoulders begin: the first row, from the top, after
 * which the garment stays nearly as wide as its body for a while. A hanger
 * and hook above the collar are narrower, so they're passed over. Falls back
 * to the top of `bounds` when the top third has no such row.
 */
export function shoulderRow(mask: Uint8Array, width: number, bounds: Rect, bodyWidth: number): number {
  const wide = bodyWidth * 0.85
  const steady = Math.max(1, Math.round(bounds.height * 0.06))
  let run = 0
  for (let y = bounds.y; y < bounds.y + bounds.height / 3 + steady; y++) {
    let count = 0
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) count += mask[y * width + x]
    run = count >= wide ? run + 1 : 0
    if (run === steady) return y - steady + 1
  }
  return bounds.y
}

/**
 * The body of a top, without its sleeves: as wide as the hem, which sleeves
 * never reach, and from just above the shoulders down. That leaves out most
 * of a hanger above the collar; coverNeckOpening paints over the rest.
 */
export function torsoRect(mask: Uint8Array, width: number, bounds: Rect): Rect {
  const centre = massCentreX(mask, width, bounds)
  const runs = [0.86, 0.9, 0.94].flatMap((fraction) => {
    const row = Math.round(bounds.y + fraction * (bounds.height - 1))
    const run = runNear(mask, width, row, centre)
    return run ? [run] : []
  })
  if (runs.length === 0) return bounds
  const left = median(runs.map((run) => run.left))
  const right = median(runs.map((run) => run.right))
  const bottom = bounds.y + bounds.height - 1
  const shoulders = shoulderRow(mask, width, bounds, right - left + 1)
  const top = Math.max(bounds.y, Math.round(shoulders - COLLAR_RISE * (bottom - shoulders)))
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
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

/** The colour most of the garment is inside `rect`, so a print, pocket or hand doesn't sway it. */
export function dominantColor(image: RgbaImage, mask: Uint8Array, rect: Rect): Rgb {
  const channels: [number[], number[], number[]] = [[], [], []]
  const stride = Math.max(1, Math.round(Math.sqrt((rect.width * rect.height) / 4000)))
  for (let y = rect.y; y < rect.y + rect.height; y += stride) {
    for (let x = rect.x; x < rect.x + rect.width; x += stride) {
      if (!mask[y * image.width + x]) continue
      const [r, g, b] = pixel(image, x, y)
      channels[0].push(r)
      channels[1].push(g)
      channels[2].push(b)
    }
  }
  if (channels[0].length === 0) return averageColor(image, mask, rect)
  return [median(channels[0]), median(channels[1]), median(channels[2])]
}

/**
 * Picks the patch of fabric that best represents the garment, to tile over
 * the back and sleeves. Candidate squares across the crop are scored by how
 * far their pixels sit from the garment's dominant colour, so the pick steers
 * clear of prints, pockets, labels and hands. Falls back to a fixed spot when
 * no candidate is fully garment.
 */
export function chooseSwatch(
  templateId: GarmentTemplateId,
  image: RgbaImage,
  mask: Uint8Array,
  crop: Rect,
): Rect {
  const trousers = templateId === 'trousers-straight'
  const size = Math.max(2, Math.round(Math.min(crop.width, crop.height) * (trousers ? 0.16 : 0.2)))
  const dominant = dominantColor(image, mask, crop)
  const stride = Math.max(1, Math.round(size / 24))
  let best: Rect | null = null
  let bestScore = Infinity

  for (let fy = 0.2; fy <= 0.85; fy += 0.08) {
    for (let fx = 0.04; fx <= 0.96; fx += 0.06) {
      // Shirts keep away from the buttons and any print down the middle.
      if (!trousers && Math.abs(fx + size / crop.width / 2 - 0.5) < 0.12) continue
      const rect = {
        x: Math.round(crop.x + fx * crop.width),
        y: Math.round(crop.y + fy * crop.height),
        width: size,
        height: size,
      }
      if (rect.x + size > crop.x + crop.width || rect.y + size > crop.y + crop.height) continue
      let total = 0
      let garment = 0
      let samples = 0
      for (let y = rect.y; y < rect.y + size; y += stride) {
        for (let x = rect.x; x < rect.x + size; x += stride) {
          samples++
          if (!mask[y * image.width + x]) continue
          garment++
          total += colorDistance(pixel(image, x, y), dominant)
        }
      }
      if (garment < samples * 0.97) continue
      const score = total / garment
      if (score < bestScore) {
        bestScore = score
        best = rect
      }
    }
  }
  return best ?? swatchRect(templateId, crop)
}

/**
 * Evens out the light across a fabric sample: each pixel is scaled by how
 * much brighter or darker its surroundings are than the sample as a whole.
 * Folds and shadows would otherwise repeat as a pattern once tiled.
 */
export function flattenLighting(pixels: RgbaImage): RgbaImage {
  const { width, height, data } = pixels
  const radius = Math.max(1, Math.round(Math.min(width, height) / 4))
  const result = new Uint8ClampedArray(data)
  const stride = width + 1
  for (let channel = 0; channel < 3; channel++) {
    // Summed-area table, so each local average is four lookups.
    const sums = new Float64Array(stride * (height + 1))
    let total = 0
    for (let y = 0; y < height; y++) {
      let row = 0
      for (let x = 0; x < width; x++) {
        const value = data[(y * width + x) * 4 + channel]
        row += value
        total += value
        sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row
      }
    }
    const mean = total / (width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - radius)
        const x1 = Math.min(width, x + radius + 1)
        const y0 = Math.max(0, y - radius)
        const y1 = Math.min(height, y + radius + 1)
        const sum = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0]
        const local = sum / ((x1 - x0) * (y1 - y0))
        const i = (y * width + x) * 4 + channel
        result[i] = local > 0 ? (data[i] * mean) / local : data[i]
      }
    }
  }
  return { data: result, width, height }
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

/** The tiled fabric sample's colour at (x, y). */
function tileAt(fill: RgbaImage, x: number, y: number) {
  const tile = (mirrored(y, fill.height) * fill.width + mirrored(x, fill.width)) * 4
  return fill.data.subarray(tile, tile + 3)
}

/** The smallest colour difference that can count as "not the fabric". */
const FOREIGN_COLOR = 60

/** How far a neckline dips below the shoulders, as a share of the crop's height. */
const NECKLINE_DIP = 0.03

/**
 * How many rows at the top of a top's front crop its neck opening can show
 * in: those above the shoulders, and a few more for the dip of the neckline.
 */
export function neckBand(mask: Uint8Array, width: number, bounds: Rect, crop: Rect): number {
  return shoulderRow(mask, width, bounds, crop.width) - crop.y + Math.round(crop.height * NECKLINE_DIP)
}

/** Counts the colours in rows `from` onwards, in coarse bins of 16 levels per channel. */
function colorBins(image: RgbaImage, from: number) {
  const bins = new Uint32Array(4096)
  for (let i = from * image.width * 4; i < image.data.length; i += 4) {
    bins[((image.data[i] >> 4) << 8) | ((image.data[i + 1] >> 4) << 4) | (image.data[i + 2] >> 4)]++
  }
  return bins
}

/** How many of the binned pixels are close to `color`: in its bin or a neighbouring one. */
function nearbyCount(bins: Uint32Array, [r, g, b]: Rgb) {
  let count = 0
  for (let dr = -1; dr <= 1; dr++) {
    for (let dg = -1; dg <= 1; dg++) {
      for (let db = -1; db <= 1; db++) {
        const [br, bg, bb] = [(r >> 4) + dr, (g >> 4) + dg, (b >> 4) + db]
        if (br < 0 || bg < 0 || bb < 0 || br > 15 || bg > 15 || bb > 15) continue
        count += bins[(br << 8) | (bg << 4) | bb]
      }
    }
  }
  return count
}

/** How close to the backdrop a colour must be to count as backdrop showing through. */
const BACKDROP_MATCH = 60

/**
 * Paints over what shows through a top's neck opening, such as the rest of a
 * hanger, the shaded inside of the back, a size label or the backdrop, with
 * the fabric sample. Only the top `band` rows change. Within them, a colour
 * is painted over if it's the backdrop's, or if it turns up nowhere lower
 * down the front, so the squares of a check, a stripe and a contrasting
 * collar (whose front dips lower) stay as photographed.
 */
export function coverNeckOpening(
  front: RgbaImage,
  band: number,
  swatch: RgbaImage,
  fabric: Rgb,
  background: Rgb | null = null,
): RgbaImage {
  const rows = Math.min(band, front.height)
  const below = colorBins(front, rows)
  const enough = Math.max(1, (front.height - rows) * front.width * 0.001)
  const backdrop = (color: Rgb) => background !== null && colorDistance(color, background) <= BACKDROP_MATCH
  const data = new Uint8ClampedArray(front.data)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < front.width; x++) {
      const color = pixel(front, x, y)
      if (colorDistance(color, fabric) <= FOREIGN_COLOR) continue
      if (!backdrop(color) && nearbyCount(below, color) >= enough) continue
      data.set(tileAt(swatch, x, y), (y * front.width + x) * 4)
    }
  }
  return { data, width: front.width, height: front.height }
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
        data.set(tileAt(fill, x, y), target)
      }
      data[target + 3] = 255
    }
  }
  return { data, width: rect.width, height: rect.height }
}
