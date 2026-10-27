import type { GarmentTemplateId } from './garment.types'
import type { FabricTile } from './pattern-tile'

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
 * laid beside the garment and specks of busy background. Given `within`, the
 * patch that overlaps it most is kept instead.
 */
export function largestComponent(
  mask: Uint8Array,
  width: number,
  height: number,
  within?: Uint8Array,
): Uint8Array {
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
    let size = 0
    labels[start] = label
    queue[tail++] = start
    while (head < tail) {
      const i = queue[head++]
      size += within ? within[i] : 1
      forNeighbours(i, width, height, (j) => {
        if (mask[j] && !labels[j]) {
          labels[j] = label
          queue[tail++] = j
        }
      })
    }
    if (size > bestSize) {
      bestSize = size
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

/** How far round each pixel its texture is averaged, in pixels. */
const TEXTURE_RADIUS = 2

/** Added to brightness when judging texture, so the noise in a near-black backdrop doesn't read as a weave. */
const DARK_OFFSET = 10

/**
 * How textured the photo is around each pixel: how far each pixel stands out
 * from the average of its four neighbours (on the colorDistance scale),
 * averaged over a square of side 2 * radius + 1, relative to how bright that
 * square is. A steady ramp isn't texture, so a backdrop shading gradually
 * across the photo or into a soft halo scores low; a weave, a seam or the
 * edge of a garment scores high. Being relative to brightness, a weave reads
 * the same in shadow as in light, and wood grain lit in the middle of a photo
 * reads no busier than at its darker edges.
 */
export function textureMap(image: RgbaImage, radius = TEXTURE_RADIUS): Float32Array {
  const { data, width, height } = image
  const total = width * height
  const laplacian = new Float32Array(total)
  const light = new Float32Array(total)
  for (let i = 0; i < total; i++) light[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = (y * width + x) * 4
      const up = p - width * 4
      const down = p + width * 4
      const dr = 4 * data[p] - data[p - 4] - data[p + 4] - data[up] - data[down]
      const dg = 4 * data[p + 1] - data[p - 3] - data[p + 5] - data[up + 1] - data[down + 1]
      const db = 4 * data[p + 2] - data[p - 2] - data[p + 6] - data[up + 2] - data[down + 2]
      // Weighted as in colorDistance, and quartered so a lone odd pixel scores its own colour difference.
      const red = data[p]
      laplacian[p / 4] = Math.sqrt((2 + red / 256) * dr * dr + 4 * dg * dg + (2 + (255 - red) / 256) * db * db) / 4
    }
  }
  const texture = boxMean(laplacian, width, height, radius)
  const brightness = boxMean(light, width, height, radius)
  for (let i = 0; i < total; i++) texture[i] /= brightness[i] + DARK_OFFSET
  return texture
}

/** Mean of `values` over a square of side 2 * radius + 1, clipped at the image's edges. */
function boxMean(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  const rows = new Float32Array(values.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let x = 0; x < Math.min(radius, width); x++) sum += values[row + x]
    for (let x = 0; x < width; x++) {
      if (x + radius < width) sum += values[row + x + radius]
      if (x - radius - 1 >= 0) sum -= values[row + x - radius - 1]
      rows[row + x] = sum / (Math.min(width - 1, x + radius) - Math.max(0, x - radius) + 1)
    }
  }
  // Down the columns, keeping a running sum for each so the rows are read in order.
  const result = new Float32Array(values.length)
  const columns = new Float64Array(width)
  for (let y = 0; y < Math.min(radius, height); y++) {
    for (let x = 0; x < width; x++) columns[x] += rows[y * width + x]
  }
  for (let y = 0; y < height; y++) {
    if (y + radius < height) for (let x = 0; x < width; x++) columns[x] += rows[(y + radius) * width + x]
    if (y - radius - 1 >= 0) for (let x = 0; x < width; x++) columns[x] -= rows[(y - radius - 1) * width + x]
    const count = Math.min(height - 1, y + radius) - Math.max(0, y - radius) + 1
    for (let x = 0; x < width; x++) result[y * width + x] = columns[x] / count
  }
  return result
}

/** How far from the garment's colours the texture barrier reaches, as a share of the photo's long side. */
const BARRIER_REACH = 0.04

/** The least texture that holds the backdrop back at the default tolerance, whatever the backdrop. */
const BARRIER_FLOOR = 0.3

/** How many times as textured as the backdrop itself (bar its busiest few pixels) the barrier is. */
const BARRIER_FACTOR = 2

/**
 * Marks pixels within about `distance` of one whose colour the backdrop never
 * shows. Worked out on blocks of 4 x 4 pixels, as it only needs to be roughly
 * right.
 */
function nearGarmentColors(image: RgbaImage, inRange: Uint8Array, distance: number): Uint8Array {
  const { data, width, height } = image
  const BLOCK = 4
  const columns = Math.ceil(width / BLOCK)
  const rows = Math.ceil(height / BLOCK)
  const marked = new Uint8Array(columns * rows)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!inRange[i] && data[i * 4 + 3] >= 128) marked[Math.floor(y / BLOCK) * columns + Math.floor(x / BLOCK)] = 1
    }
  }
  const blocks = dilateMask(marked, columns, rows, Math.ceil(distance / BLOCK))
  const near = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) near[y * width + x] = blocks[Math.floor(y / BLOCK) * columns + Math.floor(x / BLOCK)]
  }
  return near
}

/**
 * The pixels the backdrop isn't grown into, marked with 1: textured ones near
 * colours the backdrop never shows. The black squares of a check on a black
 * backdrop look just like the backdrop, but the weave of the squares around
 * them doesn't, so the backdrop can't seep from one dark square to the next
 * through the dark threads between. Texture counts once it's well beyond the
 * backdrop's own, measured away from the garment and round the photo's edges,
 * so a busy backdrop isn't held back by its own grain; and the barrier stays
 * near the garment, so a backdrop busier in some places than others can't be
 * cut off far from it. A higher tolerance weakens the barrier along with the
 * colour tests.
 *
 * `inRange` marks the pixels within range of the backdrop's colour.
 */
export function textureBarrier(image: RgbaImage, inRange: Uint8Array, tolerance: number): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  const texture = textureMap(image)
  const near = nearGarmentColors(image, inRange, Math.max(1, Math.round(Math.max(width, height) * BARRIER_REACH)))
  // Samples of the backdrop's own texture: backdrop-coloured pixels away from
  // the garment, and round the photo's edges. The busier sample wins. At the
  // edges, a garment running off the photo is near its own colours, so only
  // the rest of the edge counts, unless that leaves too little (a busy
  // backdrop straying out of its own colour range everywhere).
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.02))
  const away: number[] = []
  const edges: number[] = []
  const edgesNearGarment: number[] = []
  for (let i = 0; i < total; i += 7) {
    if (!inRange[i] || data[i * 4 + 3] < 128) continue
    const x = i % width
    const y = (i - x) / width
    const atEdge = x < band || y < band || x >= width - band || y >= height - band
    if (!near[i]) away.push(texture[i])
    if (atEdge) (near[i] ? edgesNearGarment : edges).push(texture[i])
  }
  const edgeSample = edges.length >= 50 ? edges : [...edges, ...edgesNearGarment]
  const own = Math.max(percentile(away, 0.95), percentile(edgeSample, 0.95))
  // A low tolerance tightens the barrier, but never so far that the backdrop's own texture holds it back.
  const slack = tolerance / DEFAULT_BACKGROUND_TOLERANCE
  const limit = Math.max(BARRIER_FLOOR * slack, BARRIER_FACTOR * own * Math.max(1, slack))
  const blocked = new Uint8Array(total)
  for (let i = 0; i < total; i++) if (near[i] && texture[i] > limit) blocked[i] = 1
  return blocked
}

/**
 * Grows the background inwards from the photo's edges through pixels in
 * range of the backdrop's colour, stepping no further than `step` in colour
 * at a time. Pixels in `blocked` hold it back (see textureBarrier), though it
 * carries on a few pixels past them. Returns 1 for each background pixel.
 */
function growBackdrop(image: RgbaImage, inRange: Uint8Array, step: number, blocked: Uint8Array | null): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  const isBackground = new Uint8Array(total)
  const transparent = (i: number) => data[i * 4 + 3] < 128
  const rgb = (i: number): Rgb => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
  const joins = (j: number, from: Rgb) => transparent(j) || (inRange[j] === 1 && colorDistance(rgb(j), from) <= step)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const add = (i: number) => {
    isBackground[i] = 1
    queue[tail++] = i
  }

  for (let x = 0; x < width; x++) {
    for (const i of [x, (height - 1) * width + x]) {
      if (!isBackground[i] && !blocked?.[i] && (transparent(i) || inRange[i])) add(i)
    }
  }
  for (let y = 0; y < height; y++) {
    for (const i of [y * width, y * width + width - 1]) {
      if (!isBackground[i] && !blocked?.[i] && (transparent(i) || inRange[i])) add(i)
    }
  }

  // Grow the backdrop up to the barrier, noting where it was held back.
  const held: number[] = []
  while (head < tail) {
    const from = queue[head++]
    const here = rgb(from)
    forNeighbours(from, width, height, (j) => {
      if (isBackground[j] || !joins(j, here)) return
      if (blocked?.[j]) {
        isBackground[j] = 1
        held.push(j)
      } else {
        add(j)
      }
    })
  }

  // Texture is averaged over a square, so the barrier holds the backdrop
  // back a few pixels short of a garment's edge. Let it carry on that far
  // past the barrier, with only the colour tests to stop it; diagonally
  // too, so it reaches as far into a corner as along an edge.
  const depth = new Uint8Array(total)
  head = 0
  tail = 0
  for (const j of held) {
    depth[j] = 1
    queue[tail++] = j
  }
  while (head < tail) {
    const from = queue[head++]
    if (depth[from] > TEXTURE_RADIUS) continue
    const here = rgb(from)
    const x = from % width
    for (let dy = -width; dy <= width; dy += width) {
      if (from + dy < 0 || from + dy >= total) continue
      for (let dx = -1; dx <= 1; dx++) {
        const j = from + dy + dx
        if ((dx === -1 && x === 0) || (dx === 1 && x === width - 1) || isBackground[j] || !joins(j, here)) continue
        depth[j] = depth[from] + 1
        add(j)
      }
    }
  }
  return isBackground
}

/** How saturated (as in HSV) a backdrop must be for its shadows to be known by their colour. */
const COLOURED_BACKDROP = 0.25

/** The least brightness, out of 255, at which a backdrop's colour is told reliably. */
const READABLE_BACKDROP = 64

/** How far a shadow's chromaticity may stray from the backdrop's hue. */
const SHADOW_HUE = 0.03

/** The darkest a shadow is taken to be, as a share of the backdrop's lightness. */
const DARKEST_SHADOW = 0.45

/**
 * A test for the backdrop's own shadows, such as the one a folded shirt casts
 * on a pink sheet: a darker copy of the backdrop's colour. On a coloured
 * backdrop a shadow keeps its hue and, lit by light the backdrop itself
 * coloured, gets more saturated, never greyer; so a pixel counts if its
 * chromaticity (each channel's share of r + g + b) lies on the line from grey
 * out through the backdrop's, up to twice as far out, and it's between
 * DARKEST_SHADOW and 1 times the backdrop's lightness. A garment of a
 * duller or different hue isn't taken for a shadow, and one in a darker shade
 * of the backdrop's colour is still held back by its sharp edge, which the
 * backdrop can't step across. Null for a near-grey or very dark backdrop,
 * whose hue says nothing (a grey garment on grey would be eaten).
 */
function shadowTest(background: Rgb): ((color: Rgb) => boolean) | null {
  const [r, g, b] = background
  const brightest = Math.max(r, g, b)
  if (brightest < READABLE_BACKDROP || (brightest - Math.min(r, g, b)) / brightest < COLOURED_BACKDROP) return null
  const light = r + g + b
  const [hueR, hueG] = [r / light, g / light]
  // How far out from grey the backdrop's chromaticity lies, and which way.
  const saturation = Math.hypot(hueR - 1 / 3, hueG - 1 / 3)
  const [outR, outG] = [(hueR - 1 / 3) / saturation, (hueG - 1 / 3) / saturation]
  return ([pr, pg, pb]) => {
    const sum = pr + pg + pb
    if (sum < light * DARKEST_SHADOW || sum > light) return false
    const [dr, dg] = [pr / sum - hueR, pg / sum - hueG]
    const along = dr * outR + dg * outG
    const across = Math.abs(dr * outG - dg * outR)
    return across <= SHADOW_HUE && along >= -SHADOW_HUE && along <= saturation
  }
}

/**
 * Marks garment pixels with 1. The background is grown inwards from the
 * photo's edges: it steps across gentle changes (a shadow, a gradient
 * backdrop) but stops at the sharp change where the garment starts, and it
 * never strays far from the backdrop's colour. Nor does it grow into the
 * garment's texture (see textureBarrier), so it can't seep through a check
 * whose dark squares match a dark backdrop. Anything it can't reach, such as
 * a dark check on a dark backdrop that the garment encloses, counts as
 * garment. Tidying the mask fills notches along its edge, but a stretch of
 * backdrop bigger than a notch that looks nothing like the garment goes back
 * to being background (see reopenBackdrop). Only the largest patch of garment
 * is kept.
 *
 * Which patch that is gets decided by colour alone: the barrier only fills in
 * what the colours wore away from it, so backdrop it holds back between props
 * laid beside the garment can't join them into a bigger patch.
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
  const garment = (isBackground: Uint8Array) => {
    const mask = new Uint8Array(total)
    for (let i = 0; i < total; i++) mask[i] = isBackground[i] ? 0 : 1
    return reopenBackdrop(image, tidyMask(mask, width, height), isBackground)
  }

  if (!background) {
    const isBackground = new Uint8Array(total)
    for (let i = 0; i < total; i++) if (data[i * 4 + 3] < 128) isBackground[i] = 1
    return largestComponent(garment(isBackground), width, height)
  }

  // A busy backdrop (concrete, wood grain) needs more slack than a plain
  // one, so loosen both limits to match how much the edges themselves vary.
  const { spread, roughness } = backdropVariation(image, background)
  const step = Math.max(tolerance / 3, roughness * 3)
  const range = Math.max(tolerance * 2, spread * 1.25)
  // A shadow on a coloured backdrop can be darker than the range allows, but it's still the backdrop's colour.
  const shadow = shadowTest(background)
  const inRange = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    const color: Rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
    if (colorDistance(color, background) <= range || shadow?.(color)) inRange[i] = 1
  }
  const backdrop = growBackdrop(image, inRange, step, null)
  const byColour = largestComponent(garment(backdrop), width, height)
  // When the barrier holds back none of the backdrop the colours alone take,
  // growing it again would give the same mask, so that work is skipped.
  const blocked = textureBarrier(image, inRange, tolerance)
  if (!blocked.some((held, i) => held === 1 && backdrop[i] === 1)) return byColour
  const withBarrier = garment(growBackdrop(image, inRange, step, blocked))
  return byColour.includes(1)
    ? largestComponent(withBarrier, width, height, byColour)
    : largestComponent(withBarrier, width, height)
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
 * Square erosion or dilation, done as two quick passes (rows, then columns)
 * that keep a running count of garment pixels in the window. Outside the
 * image counts as background either way.
 */
function morph(mask: Uint8Array, width: number, height: number, radius: number, mode: 'erode' | 'dilate') {
  if (radius <= 0) return mask.slice()
  // Erosion keeps a pixel only if its whole window is garment; dilation if any
  // of it is: more than `least` of the window's pixels.
  const least = mode === 'erode' ? radius * 2 : 0

  const rows = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let inside = 0
    for (let x = 0; x < Math.min(radius, width); x++) inside += mask[row + x]
    for (let x = 0; x < width; x++) {
      if (x + radius < width) inside += mask[row + x + radius]
      if (x > radius) inside -= mask[row + x - radius - 1]
      rows[row + x] = inside > least ? 1 : 0
    }
  }

  // Down the columns, a row at a time, so memory is read in order.
  const result = new Uint8Array(mask.length)
  const inside = new Int32Array(width)
  for (let y = 0; y < Math.min(radius, height); y++) {
    const row = y * width
    for (let x = 0; x < width; x++) inside[x] += rows[row + x]
  }
  for (let y = 0; y < height; y++) {
    const entering = (y + radius) * width
    const leaving = (y - radius - 1) * width
    const row = y * width
    if (y + radius < height) for (let x = 0; x < width; x++) inside[x] += rows[entering + x]
    if (y > radius) for (let x = 0; x < width; x++) inside[x] -= rows[leaving + x]
    for (let x = 0; x < width; x++) result[row + x] = inside[x] > least ? 1 : 0
  }
  return result
}

/**
 * Tidies a raw garment mask: an opening removes thin attachments such as a
 * hanger hook or rail, and a closing fills notches along the edge, such as
 * dark checks that merged into a dark backdrop.
 */
export function tidyMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const thin = Math.max(1, Math.round(Math.min(width, height) * 0.008))
  const gap = closingRadius(width, height)
  const opened = dilateMask(erodeMask(mask, width, height, thin), width, height, thin)
  return erodeMask(dilateMask(opened, width, height, gap), width, height, gap)
}

/** How far tidyMask's closing reaches, in pixels: it fills gaps up to about twice this wide. */
function closingRadius(width: number, height: number) {
  return Math.max(1, Math.round(Math.max(width, height) * 0.025))
}

/** The least share of a garment's pixels a colour (or one close to it) must make up to count as one of its own. */
const OWN_COLOR = 0.01

/**
 * Sends back to background each patch of backdrop that tidyMask's closing
 * filled in although the backdrop had reached it, such as the strip of wall
 * between an arm and the body, the gap between trouser legs or the corner
 * where a folded leg crosses the other. Left as garment, those would be
 * copied onto the front as they are; as background, they get the fabric.
 *
 * A patch stays filled if it's no bigger than a notch, or if most of it shows
 * colours the garment itself does: the dark squares of a check lost to a dark
 * backdrop, or deep shadow in a fold, are part of the garment, and look it.
 * In a cut-out, where `isBackground` is the transparent pixels, only the size
 * counts.
 */
function reopenBackdrop(image: RgbaImage, tidied: Uint8Array, isBackground: Uint8Array): Uint8Array {
  const { data, width, height } = image
  const total = width * height
  const notch = (closingRadius(width, height) / 2) ** 2
  // The garment's own colours: those of the pixels the backdrop never reached.
  const bins = new Uint32Array(4096)
  let garment = 0
  for (let i = 0; i < total; i++) {
    if (!tidied[i] || isBackground[i]) continue
    bins[colorBin(data, i * 4)]++
    garment++
  }
  const enough = Math.max(1, garment * OWN_COLOR)
  const ownBin = new Int8Array(4096).fill(-1)
  const looksOwn = (i: number) => {
    if (data[i * 4 + 3] < 128) return false
    const bin = colorBin(data, i * 4)
    if (ownBin[bin] < 0) ownBin[bin] = nearbyCount(bins, pixel(image, i % width, Math.floor(i / width))) >= enough ? 1 : 0
    return ownBin[bin] === 1
  }

  const result = tidied.slice()
  const seen = new Uint8Array(total)
  const queue = new Int32Array(total)
  const filledIn = (j: number) => tidied[j] === 1 && isBackground[j] === 1
  for (let start = 0; start < total; start++) {
    if (seen[start] || !filledIn(start)) continue
    // The patch's pixels end up in queue[0, tail).
    let head = 0
    let tail = 0
    let own = 0
    seen[start] = 1
    queue[tail++] = start
    while (head < tail) {
      const i = queue[head++]
      if (looksOwn(i)) own++
      forNeighbours(i, width, height, (j) => {
        if (!seen[j] && filledIn(j)) {
          seen[j] = 1
          queue[tail++] = j
        }
      })
    }
    if (tail <= notch || own * 2 >= tail) continue
    for (let k = 0; k < tail; k++) result[queue[k]] = 0
  }
  return result
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

/** The colour of texel (x, y) of `pixels`. */
function texel(pixels: RgbaImage, x: number, y: number) {
  const i = (y * pixels.width + x) * 4
  return pixels.data.subarray(i, i + 3)
}

/** The fractional part of `value`, from 0 up to (not including) 1, for negative values too. */
function fraction(value: number) {
  return value - Math.floor(value)
}

/**
 * The tiled fabric's colour at (x, y) of the area being filled, which sits at
 * (photoX, photoY) in the photo. A tile of the fabric's repeat that knows
 * where it came from is laid in step with the photo, so a check carries on
 * through a gap; anything else repeats from the area's corner, mirrored
 * unless it's a seamless repeat.
 */
function tileAt(fill: RgbaImage | FabricTile, x: number, y: number, photoX = x, photoY = y) {
  if (!('wrap' in fill)) return texel(fill, mirrored(x, fill.width), mirrored(y, fill.height))
  const { pixels } = fill
  if (fill.wrap === 'repeat' && fill.placement) {
    const { origin, u, v } = fill.placement
    const dx = photoX - origin[0]
    const dy = photoY - origin[1]
    const det = u[0] * v[1] - u[1] * v[0]
    const s = fraction((dx * v[1] - dy * v[0]) / det)
    const t = fraction((u[0] * dy - u[1] * dx) / det)
    // A hair over, so a point on a texel's edge doesn't round down into the one before it.
    const at = (share: number, length: number) => Math.min(length - 1, Math.floor(share * length + 1e-9))
    return texel(pixels, at(s, pixels.width), at(t, pixels.height))
  }
  const sx = Math.floor((x * pixels.width) / fill.width)
  const sy = Math.floor((y * pixels.height) / fill.height)
  return fill.wrap === 'repeat'
    ? texel(pixels, ((sx % pixels.width) + pixels.width) % pixels.width, ((sy % pixels.height) + pixels.height) % pixels.height)
    : texel(pixels, mirrored(sx, pixels.width), mirrored(sy, pixels.height))
}

/** An sRGB channel value (0 to 255) as linear light (0 to 1). */
function toLinear(value: number) {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Linear light (0 to 1) as an sRGB channel value (0 to 255). */
function toSrgb(value: number) {
  const v = Math.min(1, Math.max(0, value))
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
}

/** How bright the pixel at offset `i` of `data` is, in linear light. */
function luminanceAt(data: Uint8ClampedArray, i: number) {
  return 0.2126 * toLinear(data[i]) + 0.7152 * toLinear(data[i + 1]) + 0.0722 * toLinear(data[i + 2])
}

/** The most a tile's brightness is changed by, either way, so a poor reading can't wash it out. */
const MOST_BRIGHTER = 1.5

/**
 * Evens a tile of the fabric's repeat to the brightness of the photo it was
 * cut from, so the back and sleeves are as light as the front. Folding the
 * repeats together and taking out their shading can leave a tile a little
 * darker (fine stripes came out about a tenth darker). One factor is used for
 * every channel, in linear light, so the colours don't shift. Anything else
 * comes back as it is.
 */
export function evenTileBrightness(tile: FabricTile, image: RgbaImage, mask: Uint8Array): FabricTile {
  if (tile.wrap !== 'repeat' || !tile.placement) return tile
  const { origin, u, v } = tile.placement
  const STEPS = 48
  let photo = 0
  let count = 0
  for (let a = 0; a < STEPS; a++) {
    for (let b = 0; b < STEPS; b++) {
      const [s, t] = [(a + 0.5) / STEPS, (b + 0.5) / STEPS]
      const x = Math.round(origin[0] + s * u[0] + t * v[0])
      const y = Math.round(origin[1] + s * u[1] + t * v[1])
      if (x < 0 || y < 0 || x >= image.width || y >= image.height || !mask[y * image.width + x]) continue
      photo += luminanceAt(image.data, (y * image.width + x) * 4)
      count++
    }
  }
  const { data, width, height } = tile.pixels
  let own = 0
  for (let i = 0; i < data.length; i += 4) own += luminanceAt(data, i)
  own /= data.length / 4
  if (count < (STEPS * STEPS) / 2 || own <= 0) return tile
  const gain = Math.min(MOST_BRIGHTER, Math.max(1 / MOST_BRIGHTER, photo / count / own))
  const evened = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) evened[i + channel] = toSrgb(toLinear(data[i + channel]) * gain)
    evened[i + 3] = data[i + 3]
  }
  return { ...tile, pixels: { data: evened, width, height } }
}

/**
 * Resizes a fabric tile to `size` x `size` by bilinear filtering that wraps
 * round its edges the way the tile will repeat, so no seam line appears where
 * one copy meets the next (a canvas resize clamps at the edges instead).
 */
export function resampleTile(pixels: RgbaImage, size: number, wrap: 'repeat' | 'mirror'): RgbaImage {
  const { width, height } = pixels
  const index = (i: number, length: number) => (wrap === 'repeat' ? ((i % length) + length) % length : mirrored(i, length))
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    const fy = ((y + 0.5) * height) / size - 0.5
    const y0 = Math.floor(fy)
    const ty = fy - y0
    const [top, bottom] = [index(y0, height), index(y0 + 1, height)]
    for (let x = 0; x < size; x++) {
      const fx = ((x + 0.5) * width) / size - 0.5
      const x0 = Math.floor(fx)
      const tx = fx - x0
      const [left, right] = [index(x0, width), index(x0 + 1, width)]
      for (let channel = 0; channel < 3; channel++) {
        const at = (column: number, row: number) => pixels.data[(row * width + column) * 4 + channel]
        const upper = at(left, top) * (1 - tx) + at(right, top) * tx
        const lower = at(left, bottom) * (1 - tx) + at(right, bottom) * tx
        data[(y * size + x) * 4 + channel] = upper * (1 - ty) + lower * ty
      }
      data[(y * size + x) * 4 + 3] = 255
    }
  }
  return { data, width: size, height: size }
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

/** The coarse bin, of 16 levels per channel, of the colour at offset `p` of `data`. */
function colorBin(data: Uint8ClampedArray, p: number) {
  return ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4)
}

/**
 * Counts the colours in rows `from` onwards, in coarse bins of 16 levels per
 * channel, leaving out the pixels marked in `skip` (indexed like the image).
 */
function colorBins(image: RgbaImage, from: number, skip?: Uint8Array) {
  const bins = new Uint32Array(4096)
  for (let i = from * image.width; i < image.width * image.height; i++) {
    if (!skip?.[i]) bins[colorBin(image.data, i * 4)]++
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

/** How many pixels of soft edge around something painted over go with it. */
const EDGE_ROUNDS = 2

/** How close in colour a pixel must stay to a patch of foreign colour in the neck band to be part of it. */
const KEEPS_COLOR = 60

/** A patch of one foreign colour in the neck band, as found by neckPieces(). */
interface Piece {
  /** Its pixels, as indices into the front. */
  pixels: Int32Array
  /** Its box, in front pixels. */
  box: Rect
  /** Whether it crosses the band's bottom row. */
  crossing: boolean
  /** Its average colour. */
  color: Rgb
}

/**
 * The foreign pixels of the neck band, the front's first `rows` rows (marked
 * in `foreign`, a row of `width` at a time), in patches of one colour. Each
 * takes in the foreign pixels joined to its first that stay within
 * KEEPS_COLOR of that one's colour, followed below the band as far as
 * `foreign` goes. Those on the band's bottom row go first, so something
 * crossing it is followed from there.
 */
function neckPieces(front: RgbaImage, foreign: Uint8Array, rows: number): Piece[] {
  const { width } = front
  const reach = foreign.length / width
  const seen = new Uint8Array(foreign.length)
  const queue = new Int32Array(foreign.length)
  const colorOf = (i: number) => pixel(front, i % width, Math.floor(i / width))
  const found: Piece[] = []
  const follow = (seed: number, crossing: boolean) => {
    if (!foreign[seed] || seen[seed]) return
    const color = colorOf(seed)
    let [left, top, right, bottom] = [width, reach, -1, -1]
    const sum = [0, 0, 0]
    let tail = 0
    seen[seed] = 1
    queue[tail++] = seed
    for (let head = 0; head < tail; head++) {
      const i = queue[head]
      const [x, y] = [i % width, Math.floor(i / width)]
      for (let channel = 0; channel < 3; channel++) sum[channel] += front.data[i * 4 + channel]
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      forNeighbours(i, width, reach, (j) => {
        if (seen[j] || !foreign[j] || colorDistance(colorOf(j), color) > KEEPS_COLOR) return
        seen[j] = 1
        queue[tail++] = j
      })
    }
    const box = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
    const average: Rgb = [sum[0] / tail, sum[1] / tail, sum[2] / tail]
    found.push({ pixels: queue.slice(0, tail), box, crossing, color: average })
  }
  for (let seed = (rows - 1) * width; seed < rows * width; seed++) follow(seed, true)
  for (let seed = 0; seed < (rows - 1) * width; seed++) follow(seed, false)
  return found
}

/** How many times as wide as it's tall a patch must be to be taken for a hanger bar. */
const BAR_SHAPE = 4

/**
 * Whether `piece` crosses the bottom of the neck band, the front's first
 * `rows` rows, and ends within `dip` rows below it: a hanger bar lying across
 * the neck, or the foot of a size label. Something that runs further down,
 * out to either side of the front, or over more than half the band's height
 * belongs to the garment instead, such as a collar, a placket, a raglan
 * sleeve or a stripe. So does a detail with `enough` of itself below the band
 * to vouch for its own colour there, such as a logo or the curve of a collar
 * straddling the band's bottom, unless it's shaped like a hanger bar.
 */
function shallowCrossing({ crossing, box, pixels }: Piece, rows: number, dip: number, width: number, enough: number) {
  const bottom = box.y + box.height - 1
  if (!crossing || bottom >= rows + dip || box.height > rows / 2 || box.x === 0 || box.x + box.width >= width) return false
  let under = 0
  for (const i of pixels) if (i >= rows * width) under++
  return under < enough || box.width >= BAR_SHAPE * box.height
}

/** How far a shade's chromaticity may stray from the line out from grey through the colour it's a shade of. */
const SHADE_HUE = 0.06

/**
 * Whether `color` is a darker shade of `of`: darker overall, with its
 * chromaticity (each channel's share of r + g + b) near the line from grey
 * out through that of `of`, as shade deepens a colour but doesn't turn it.
 */
function shadeOf(color: Rgb, of: Rgb) {
  const [sum, ofSum] = [color[0] + color[1] + color[2], of[0] + of[1] + of[2]]
  if (sum <= 0 || sum >= ofSum) return false
  const [cr, cg] = [color[0] / sum - 1 / 3, color[1] / sum - 1 / 3]
  const [or, og] = [of[0] / ofSum - 1 / 3, of[1] / ofSum - 1 / 3]
  const length = Math.hypot(or, og)
  if (length === 0) return Math.hypot(cr, cg) <= SHADE_HUE
  const across = Math.abs(cr * og - cg * or) / length
  const along = (cr * or + cg * og) / length
  return across <= SHADE_HUE && along >= -SHADE_HUE
}

/**
 * Whether `piece` could be a hanger bar: much wider than it's tall, and clear
 * of the top and sides of the front (`width` wide). Backdrop above the
 * shoulders, or a stripe, isn't one.
 */
function barLike({ box }: Piece, width: number) {
  return box.width >= BAR_SHAPE * box.height && box.y > 0 && box.x > 0 && box.x + box.width < width
}

/**
 * Whether `piece` could be part of the shaded end of the hanger bar `bar`,
 * in another colour: a darker shade of the bar's, lying within the bar's
 * rows, and no wider than twice the bar is tall, nor further than that past
 * either end of it. A button beside the bar, in a colour of its own, isn't.
 */
function endOf({ box, color }: Piece, { box: bar, color: barColor }: Piece) {
  const beyond = 2 * bar.height
  const within =
    box.y >= bar.y &&
    box.y + box.height <= bar.y + bar.height &&
    box.width <= beyond &&
    box.x >= bar.x - beyond &&
    box.x + box.width <= bar.x + bar.width + beyond
  return within && shadeOf(color, barColor)
}

/** How far gaps in what's painted over at the neck are closed, as a share of the front's width. */
const NECK_CLOSING = 0.01

/**
 * Numbers the separate parts of what's marked in `mask` (a row of `width` at
 * a time), joined across corners too: 0 off the mask, and 1 up for the parts.
 */
function partsOf(mask: Uint8Array, width: number): Int32Array {
  const height = mask.length / width
  const parts = new Int32Array(mask.length)
  const queue = new Int32Array(mask.length)
  let count = 0
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || parts[start]) continue
    parts[start] = ++count
    let tail = 0
    queue[tail++] = start
    for (let head = 0; head < tail; head++) {
      const [x, y] = [queue[head] % width, Math.floor(queue[head] / width)]
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const j = ny * width + nx
          if (!mask[j] || parts[j]) continue
          parts[j] = count
          queue[tail++] = j
        }
      }
    }
  }
  return parts
}

/** Whether two different parts (numbered in `parts`) both lie within `reach` of pixel `i`. */
function between(parts: Int32Array, width: number, i: number, reach: number) {
  const height = parts.length / width
  const [x, y] = [i % width, Math.floor(i / width)]
  let first = 0
  for (let ny = Math.max(0, y - reach); ny <= Math.min(height - 1, y + reach); ny++) {
    for (let nx = Math.max(0, x - reach); nx <= Math.min(width - 1, x + reach); nx++) {
      const part = parts[ny * width + nx]
      if (!part || part === first) continue
      if (first) return true
      first = part
    }
  }
  return false
}

/**
 * Makes what's marked in `covered` whole, within `zone` (both a row of
 * `width` at a time): gaps up to twice `radius` wide are closed, and any
 * patch it closes round is marked too. Paint over the print on a label, or
 * the bright wood of a hanger, and the specks between and inside go with it.
 * But a pixel notched into the outline of one painted part stays unless
 * it's part of that part's soft edge (see `edging`), so a light seam along
 * backdrop painted over isn't taken with it. Outside `zone` counts as open,
 * so nothing is closed round against it.
 */
function wholeOf(
  covered: Uint8Array,
  zone: Uint8Array,
  width: number,
  radius: number,
  edging: (i: number) => boolean,
) {
  const height = covered.length / width
  const parts = partsOf(covered, width)
  const closed = erodeMask(dilateMask(covered, width, height, radius), width, height, radius)
  const shut = covered.slice()
  const added: number[] = []
  for (let i = 0; i < covered.length; i++) {
    if (!closed[i] || !zone[i] || covered[i]) continue
    shut[i] = 1
    added.push(i)
  }
  // Flood the open pixels from the edges and from outside the zone; whatever it can't reach is enclosed.
  const open = new Uint8Array(covered.length)
  const queue = new Int32Array(covered.length)
  let tail = 0
  const visit = (i: number) => {
    if (open[i] || (shut[i] && zone[i])) return
    open[i] = 1
    queue[tail++] = i
  }
  for (let i = 0; i < covered.length; i++) {
    const [x, y] = [i % width, Math.floor(i / width)]
    if (!zone[i] || x === 0 || y === 0 || x === width - 1 || y === height - 1) visit(i)
  }
  for (let head = 0; head < tail; head++) forNeighbours(queue[head], width, height, visit)
  for (let i = 0; i < covered.length; i++) if (!open[i] && zone[i] && !shut[i]) covered[i] = 1
  // What the closing added goes too, unless it's notched into the outline of one part and no edge of it.
  for (const i of added) {
    let outline = false
    forNeighbours(i, width, height, (j) => {
      if (open[j]) outline = true
    })
    if (!outline || between(parts, width, i, 2 * radius) || edging(i)) covered[i] = 1
  }
}

/**
 * Paints over the rest of the print that each of `letters` belongs to (marked
 * in `covered`): pieces crossing the bottom of the neck band, the front's
 * first `rows` rows, painted over whole, such as the letters of a word on a
 * label straddling the band. Blurred into the label, a word comes in many
 * pieces and shades, and a letter showing only its blurred top in the band,
 * in a shade the shirt shows lower down, would otherwise be left, and half
 * the word with it. The print is the run of foreign pixels (marked in
 * `foreign`) joined to a letter, all lighter or all darker than the `fabric`.
 * Like a shallow crossing, it starts no more than `dip` rows above the band's
 * bottom and ends within `dip` rows below it, clear of the front's sides, so
 * a collar, a stripe, a check, or a detail running up beside a hanger isn't
 * one. A hanger bar is no letter, so a button beside one isn't taken either.
 */
function wholePrint(
  front: RgbaImage,
  foreign: Uint8Array,
  covered: Uint8Array,
  fabric: Rgb,
  rows: number,
  dip: number,
  letters: Piece[],
) {
  const { width, data } = front
  const reach = foreign.length / width
  const fabricLight = fabric[0] + fabric[1] + fabric[2]
  const lighter = (i: number) => data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] > fabricLight
  const seen = new Uint8Array(foreign.length)
  const queue = new Int32Array(foreign.length)
  for (const { pixels, color } of letters) {
    const tone = color[0] + color[1] + color[2] > fabricLight
    let tail = 0
    for (const i of pixels) {
      if (seen[i]) continue
      seen[i] = 1
      queue[tail++] = i
    }
    let [left, top, right, bottom] = [width, reach, -1, -1]
    for (let head = 0; head < tail; head++) {
      const i = queue[head]
      const [x, y] = [i % width, Math.floor(i / width)]
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      forNeighbours(i, width, reach, (j) => {
        if (seen[j] || !foreign[j] || lighter(j) !== tone) return
        seen[j] = 1
        queue[tail++] = j
      })
    }
    if (tail === 0 || top < rows - dip || bottom >= rows + dip || left === 0 || right === width - 1) continue
    for (let k = 0; k < tail; k++) covered[queue[k]] = 1
  }
}

/**
 * Paints over what shows through a top's neck opening, such as the rest of a
 * hanger, the shaded inside of the back, a size label or the backdrop, with
 * the fabric sample. Within the top `band` rows, a colour is painted over if
 * it's the backdrop's, or if it turns up nowhere lower down the front, so the
 * squares of a check, a stripe and a contrasting collar (whose front dips
 * lower) stay as photographed.
 *
 * A hanger bar or a label lying across the bottom of the band, and ending
 * just below it, is no proof of its own colour there: its lower part doesn't
 * count as the colour turning up lower down, and when the rest of it is
 * painted over, so is that part. A collar, placket, raglan sleeve or stripe
 * runs on further (see shallowCrossing), so it still vouches for itself. And
 * when a hanger bar is painted over, so is its shaded end, in another colour
 * that may turn up lower down (see endOf).
 * The soft edge around whatever is painted over goes too, so no outline of a
 * hanger is left, and then it all goes whole (see wholeOf), so no specks of a
 * label's print, or of its blurred foot, are left between the parts painted.
 * `offset` is where the front sits in the photo, so a tile of the fabric's
 * repeat paints in step with the check around it.
 */
export function coverNeckOpening(
  front: RgbaImage,
  band: number,
  swatch: RgbaImage | FabricTile,
  fabric: Rgb,
  background: Rgb | null = null,
  offset: [number, number] = [0, 0],
): RgbaImage {
  const { width, height } = front
  const rows = Math.max(0, Math.min(band, height))
  const dip = Math.max(1, Math.round(height * NECKLINE_DIP))
  // One row further than a shallow crossing may reach, to see whether it goes on.
  const reach = Math.min(height, rows + dip + 1)
  const foreign = new Uint8Array(reach * width)
  for (let i = 0; i < foreign.length; i++) {
    if (colorDistance(pixel(front, i % width, Math.floor(i / width)), fabric) > FOREIGN_COLOR) foreign[i] = 1
  }
  // How many pixels of a colour lower down the front make it one of the front's own.
  const enough = Math.max(1, (height - rows) * width * 0.001)
  const pieces = rows > 0 ? neckPieces(front, foreign, rows) : []
  const shallow = pieces.map((piece) => shallowCrossing(piece, rows, dip, width, enough))
  const unproven = new Uint8Array(width * height)
  pieces.forEach(({ pixels }, k) => {
    if (shallow[k]) for (const i of pixels) if (i >= rows * width) unproven[i] = 1
  })

  const below = colorBins(front, rows, unproven)
  const backdrop = (color: Rgb) => background !== null && colorDistance(color, background) <= BACKDROP_MATCH
  const covered = new Uint8Array(reach * width)
  for (let i = 0; i < rows * width; i++) {
    if (!foreign[i]) continue
    const color = pixel(front, i % width, Math.floor(i / width))
    if (backdrop(color) || nearbyCount(below, color) < enough) covered[i] = 1
  }

  // Which pieces are painted over: most of their pixels in the band. A label
  // crossing the band's bottom with only its print painted isn't, so its
  // foot, and the rib below in a colour close to the label's, stay.
  const painted = pieces.map(({ pixels }) => {
    let counted = 0
    let count = 0
    for (const i of pixels) {
      if (i >= rows * width) continue
      counted++
      count += covered[i]
    }
    return count * 2 >= counted
  })
  // A shallow crossing painted over goes whole, and so does the shaded end of
  // a hanger bar painted over. The end can come in several patches, each a
  // shade of the bar's colour, so it's followed from patch to patch.
  const pieceOf = new Int32Array(reach * width).fill(-1)
  pieces.forEach(({ pixels }, k) => pixels.forEach((i) => (pieceOf[i] = k)))
  const whole = pieces.map((_, k) => painted[k] && shallow[k])
  pieces.forEach((bar, b) => {
    if (!painted[b] || !barLike(bar, width)) return
    const trail = [b]
    const taken = new Set(trail)
    for (let t = 0; t < trail.length; t++) {
      for (const i of pieces[trail[t]].pixels) {
        forNeighbours(i, width, reach, (j) => {
          const k = pieceOf[j]
          if (k < 0 || taken.has(k) || !endOf(pieces[k], bar)) return
          taken.add(k)
          trail.push(k)
          if (!painted[k]) whole[k] = true
        })
      }
    }
  })

  // Below the band, only a piece painted over whole (and its soft edge) changes.
  const zone = new Uint8Array(reach * width)
  zone.fill(1, 0, rows * width)
  for (const [k, { pixels, box }] of pieces.entries()) {
    if (!whole[k]) continue
    for (const i of pixels) covered[i] = 1
    for (let y = rows; y < Math.min(reach, box.y + box.height + EDGE_ROUNDS); y++) {
      const from = y * width + Math.max(0, box.x - EDGE_ROUNDS)
      zone.fill(1, from, y * width + Math.min(width, box.x + box.width + EDGE_ROUNDS))
    }
  }
  for (let round = 0; round < EDGE_ROUNDS; round++) {
    const edge: number[] = []
    for (let i = 0; i < covered.length; i++) {
      if (covered[i] || !foreign[i] || !zone[i]) continue
      let next = false
      forNeighbours(i, width, reach, (j) => {
        if (covered[j]) next = true
      })
      if (next) edge.push(i)
    }
    for (const i of edge) covered[i] = 1
  }
  // A word straddling the band goes whole once some of its letters do, but
  // without a soft edge of its own, which on a light label is the label.
  const letters = pieces.filter((piece, k) => painted[k] && shallow[k] && !barLike(piece, width))
  wholePrint(front, foreign, covered, fabric, rows, dip, letters)
  // Whether a pixel beside what's painted is its soft edge: a blend of the
  // fabric and what's painted beside it, or further still that way, like a
  // dot of a label's print. One in the fabric's own colour, or off it the
  // other way, like a light seam along dark backdrop, isn't.
  const edging = (i: number) => {
    const [x, y] = [i % width, Math.floor(i / width)]
    const sum = [0, 0, 0]
    let count = 0
    for (let ny = Math.max(0, y - 1); ny <= Math.min(reach - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (!covered[ny * width + nx]) continue
        for (let channel = 0; channel < 3; channel++) sum[channel] += front.data[(ny * width + nx) * 4 + channel]
        count++
      }
    }
    if (count === 0) return false
    const color = pixel(front, x, y)
    let along = 0
    let off = 0
    let toward = 0
    for (let channel = 0; channel < 3; channel++) {
      const fromFabric = color[channel] - fabric[channel]
      const painted = sum[channel] / count - fabric[channel]
      along += fromFabric * painted
      off += fromFabric * fromFabric
      toward += painted * painted
    }
    return along > Math.sqrt(off * toward) / 2
  }
  wholeOf(covered, zone, width, Math.max(1, Math.round(width * NECK_CLOSING)), edging)

  const data = new Uint8ClampedArray(front.data)
  for (let i = 0; i < covered.length; i++) {
    if (!covered[i]) continue
    const [x, y] = [i % width, Math.floor(i / width)]
    data.set(tileAt(swatch, x, y, offset[0] + x, offset[1] + y), i * 4)
  }
  return { data, width, height: front.height }
}

/** The hues, in degrees from red towards yellow, that skin takes in a photo. */
const SKIN_HUE = [5, 45] as const

/** The saturations (as in HSV) that skin takes in a photo. */
const SKIN_SATURATION = [0.12, 0.7] as const

/** The least red channel, out of 255, at which a colour's hue is read as skin. */
const SKIN_BRIGHTNESS = 50

/**
 * Whether `color` could be skin: an orange-leaning red, moderately saturated
 * and not too dark to tell. Tan, camel, beige and stone fabrics pass too, so
 * this alone never decides that something is a hand.
 */
export function isSkinTone([r, g, b]: Rgb): boolean {
  const spread = r - Math.min(g, b)
  if (r < SKIN_BRIGHTNESS || g > r || b > g || spread === 0) return false
  const hue = (60 * (g - b)) / spread
  const saturation = spread / r
  return hue >= SKIN_HUE[0] && hue <= SKIN_HUE[1] && saturation >= SKIN_SATURATION[0] && saturation <= SKIN_SATURATION[1]
}

/** The most of the crop's width or height a hand's part of the front may span. */
const HAND_REACH = 1 / 3

/** A patch of skin tones reaching into the front crop from outside the garment, as handsOverFront() finds them. */
interface Reaching {
  /** Its pixels inside the crop, as indices into the photo. */
  inside: number[]
  /** The box round those, in photo pixels. */
  box: Rect
  /** Their average colour. */
  color: Rgb
}

/**
 * Whether `a` and `b` mirror each other across the front `crop`: one comes
 * in across its left edge and the other across its right, level with each
 * other (sharing at least half the rows of the shorter), in much the same
 * colour. So do the cuffs of a pair of long sleeves hanging beside the body,
 * or the sleeves themselves, as a garment is the same on both sides; hands
 * holding it up rarely are.
 */
function pairedAcross({ box: a, color: colorA }: Reaching, { box: b, color: colorB }: Reaching, crop: Rect) {
  const right = crop.x + crop.width - 1
  const across = (a.x === crop.x && b.x + b.width - 1 === right) || (b.x === crop.x && a.x + a.width - 1 === right)
  const shared = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return across && shared * 2 >= Math.min(a.height, b.height) && colorDistance(colorA, colorB) <= FOREIGN_COLOR
}

/**
 * The hands holding a top up, where they lie over the front `crop`: 1 for
 * each pixel of the photo to paint over. A hand is a patch of skin-toned
 * pixels, some of them garment pixels (in `solid`) in the crop, that
 * - comes from outside the garment: it touches the garment's outline. It's
 *   followed out past the outline too, through skin tones unlike the
 *   `background`, as the cut-out can take most of a hand for backdrop and
 *   leave only its shaded edge, where it lies over the garment, behind,
 * - reaches into the crop across its left, right or bottom edge, and more of
 *   it lies outside the crop than in it,
 * - covers only a corner of the crop, no more than HAND_REACH of its width
 *   or height, and never the top edge, where a raglan sleeve or a collar runs,
 * - shows colours the rest of the crop doesn't. Neither the top `band`
 *   rows of the crop, where a wooden hanger can show through the neck, nor
 *   another hand count as the rest of the crop,
 * - and has no match on the other side of the crop (see pairedAcross), as a
 *   pair of cuffs hanging into its lower corners would.
 * Nothing is taken from a garment whose own main colour is a skin tone (a
 * tan, camel or stone top), nor any colour close to its main colour; stripes
 * or a contrasting collar span too much of the crop to pass. A couple of
 * pixels of soft edge round each hand go with it.
 */
export function handsOverFront(
  image: RgbaImage,
  solid: Uint8Array,
  crop: Rect,
  band = 0,
  background: Rgb | null = null,
): Uint8Array {
  const { data, width, height } = image
  const hands = new Uint8Array(width * height)
  const dominant = dominantColor(image, solid, crop)
  if (isSkinTone(dominant)) return hands
  // Whether each pixel is a skin tone unlike the garment's own, and off the
  // garment unlike the backdrop: worked out as the patches reach it.
  const skin = new Int8Array(width * height).fill(-1)
  const candidate = (i: number) => {
    if (skin[i] < 0) {
      const color: Rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
      const shown = solid[i] || (data[i * 4 + 3] >= 128 && (!background || colorDistance(color, background) > BACKDROP_MATCH))
      skin[i] = shown && isSkinTone(color) && colorDistance(color, dominant) > FOREIGN_COLOR ? 1 : 0
    }
    return skin[i] === 1
  }
  const inCrop = (x: number, y: number) => x >= crop.x && y >= crop.y && x < crop.x + crop.width && y < crop.y + crop.height

  // Each patch of skin tones that lies partly over the garment in the crop, followed wherever it goes.
  const patches: { size: number; inside: number[]; outline: boolean }[] = []
  const owner = new Int32Array(width * height)
  const queue = new Int32Array(width * height)
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const start = y * width + x
      if (owner[start] || !solid[start] || !candidate(start)) continue
      const id = patches.length + 1
      let tail = 0
      let outline = false
      const inside: number[] = []
      owner[start] = id
      queue[tail++] = start
      for (let head = 0; head < tail; head++) {
        const i = queue[head]
        const [px, py] = [i % width, Math.floor(i / width)]
        if (inCrop(px, py)) inside.push(i)
        if (px === 0 || py === 0 || px === width - 1 || py === height - 1) outline = true
        forNeighbours(i, width, height, (j) => {
          if (!solid[j]) outline = true
          if (owner[j] || !candidate(j)) return
          owner[j] = id
          queue[tail++] = j
        })
      }
      patches.push({ size: tail, inside, outline })
    }
  }

  // The crop's own colours below the neck, leaving out every patch of skin
  // tones that comes from outside the garment.
  const bins = new Uint32Array(4096)
  let garment = 0
  for (let y = crop.y + Math.max(0, band); y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const i = y * width + x
      if (!solid[i] || (owner[i] && patches[owner[i] - 1].outline)) continue
      bins[colorBin(data, i * 4)]++
      garment++
    }
  }
  const enough = Math.max(1, garment * 0.001)

  const found: Reaching[] = []
  for (const { size, inside, outline } of patches) {
    if (!outline || size - inside.length < inside.length) continue
    let [left, top, right, bottom] = [width, height, -1, -1]
    let own = 0
    const sum = [0, 0, 0]
    for (const i of inside) {
      const [x, y] = [i % width, Math.floor(i / width)]
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      const color = pixel(image, x, y)
      for (let channel = 0; channel < 3; channel++) sum[channel] += color[channel]
      if (nearbyCount(bins, color) >= enough) own++
    }
    // Lying mostly outside the crop, it reaches in across one of its edges.
    const local = right - left + 1 <= crop.width * HAND_REACH && bottom - top + 1 <= crop.height * HAND_REACH
    if (!local || top === crop.y || own * 2 >= inside.length) continue
    const color: Rgb = [sum[0] / inside.length, sum[1] / inside.length, sum[2] / inside.length]
    found.push({ inside, box: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }, color })
  }
  let marked = false
  for (const hand of found) {
    if (found.some((other) => other !== hand && pairedAcross(hand, other, crop))) continue
    for (const i of hand.inside) hands[i] = 1
    marked = true
  }
  if (!marked) return hands

  // The soft edge round each hand, within the crop.
  const edged = dilateMask(hands, width, height, EDGE_ROUNDS)
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) hands[y * width + x] = edged[y * width + x]
  }
  return hands
}

/**
 * Copies `rect` out of the photo, painting any background inside it so gaps
 * (a shirt's neck opening, the space between trouser legs) don't end up on
 * the mannequin. `fill` is either a flat colour or a fabric sample or tile,
 * which is tiled so a pattern carries on through the gap.
 */
export function cropAndFill(
  image: RgbaImage,
  mask: Uint8Array,
  rect: Rect,
  fill: Rgb | RgbaImage | FabricTile,
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
        data.set(tileAt(fill, x, y, rect.x + x, rect.y + y), target)
      }
      data[target + 3] = 255
    }
  }
  return { data, width: rect.width, height: rect.height }
}
