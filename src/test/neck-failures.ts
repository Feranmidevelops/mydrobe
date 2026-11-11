import { findNeckline } from '../features/garments/neckline'
import { colorDistance, colourCovered, coverNeckOpening, type Rgb, type RgbaImage } from '../features/garments/photo-mapping'
import { hangingTop, type DrawnTop, type HangingTop } from './hanging-top'

/** How far a pixel's colour must move for the change to show. */
const SEEN = 30

/** How far below or beside the neckline its soft edge may be painted. */
const SOFT_EDGE = 4

function blank(width: number, height: number, color: Rgb): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4)
  return { data, width, height }
}

const colorOf = (image: RgbaImage, i: number): Rgb => [image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]]

/** The drawn top's front painted at the neck by colour alone, as before the neckline was traced. */
export function byColour({ image, band, fabric }: DrawnTop): RgbaImage {
  const covered = colourCovered(image, band, fabric, null)
  const data = new Uint8ClampedArray(image.data)
  for (let i = 0; i < covered.length; i++) if (covered[i]) data.set([...fabric, 255], i * 4)
  return { data, width: image.width, height: image.height }
}

/** The drawn top's front with its neck painted over, plain fabric for a tile. */
export function covered({ image, band, fabric }: DrawnTop): RgbaImage {
  return coverNeckOpening(image, band, blank(16, 16, fabric), fabric)
}

/** How many of `region`'s pixels changed visibly from `before` to `after`. */
function changedIn(region: Uint8Array, before: RgbaImage, after: RgbaImage) {
  let count = 0
  for (let i = 0; i < region.length; i++) {
    if (region[i] && colorDistance(colorOf(before, i), colorOf(after, i)) > SEEN) count++
  }
  return count
}

/**
 * Draws `top`, paints over its neck opening, and returns a line for each way
 * the result fails, labelled with `label`:
 * - with a neckline found, something seen through the opening (the inside of
 *   the back, a hanger, a label or its print) left showing where the opening
 *   is traced, from the top of its sides down: more than a tenth of the inside
 *   of the back there, or a twentieth of anything else, unpainted and not the
 *   fabric's colour;
 * - something on the front (a rib, a logo, a button, a placket, a detail)
 *   changed visibly in more than 5 pixels or 3% of it, and more than painting
 *   by colour alone changes it;
 * - anything changed at or below the window's last row, or, with a neckline
 *   found, anything changed outside the opening, its soft edge and what the
 *   colours alone would paint above the neckline's sides;
 * - and, when `found` is given, the neckline found or not when it should be.
 */
export function neckFailures(label: string, top: HangingTop, { found }: { found?: boolean } = {}) {
  const drawn = hangingTop(top)
  const { image, band, regions } = drawn
  const { width, height } = image
  const after = covered(drawn)
  const base = byColour(drawn)
  const neckline = findNeckline(image, band)
  const failures: string[] = []
  const fail = (what: string) => failures.push(`${label}: ${what}`)
  if (found !== undefined && !!neckline !== found) fail(found ? 'no neckline found' : 'a neckline found where there is none')

  // What's seen through the traced opening, from where its sides stop being an edge down: above that the colours decide.
  const traced = (i: number) => {
    if (!neckline) return false
    const [x, y] = [i % width, Math.floor(i / width)]
    return x >= neckline.span[0] && x <= neckline.span[1] && y >= neckline.topRow + Math.round(neckline.tilt * (x - neckline.axis))
  }
  for (const id of neckline ? drawn.behind : []) {
    const region = regions[id]
    let [size, left] = [0, 0]
    for (let i = 0; i < region.length; i++) {
      if (!region[i] || !traced(i)) continue
      size++
      const unchanged = colorDistance(colorOf(image, i), colorOf(after, i)) === 0
      if (unchanged && colorDistance(colorOf(image, i), drawn.fabric) > SEEN) left++
    }
    if (left > Math.max(2, (id === 'inside' ? 0.1 : 0.05) * size)) fail(`${left} of ${size} px of the ${id} left`)
  }
  for (const id of drawn.front) {
    const region = regions[id]
    const size = region.reduce((sum, v) => sum + v, 0)
    const [lane, colours] = [changedIn(region, image, after), changedIn(region, image, base)]
    if (lane > Math.max(5, 0.03 * size) && lane > colours) fail(`${lane} of ${size} px of the ${id} changed (${colours} by colour alone)`)
  }

  const dip = Math.max(1, Math.round(height * 0.03))
  const last = Math.min(height - 1, band + dip)
  let low = 0
  for (let i = last * width; i < width * height; i++) if (colorDistance(colorOf(image, i), colorOf(after, i)) > 0) low++
  if (low) fail(`${low} px changed at or below row ${last}`)
  if (neckline) {
    // Within the soft edge's reach of the opening, or what the colours alone paint above the neckline's sides.
    const { rows, span, topRow, tilt, axis } = neckline
    const near = new Uint8Array(width * last)
    for (let x = span[0]; x <= span[1]; x++) {
      for (let y = 0; y < Math.min(rows[x], last); y++) {
        for (let ny = Math.max(0, y - SOFT_EDGE); ny <= Math.min(last - 1, y + SOFT_EDGE); ny++) {
          for (let nx = Math.max(0, x - SOFT_EDGE); nx <= Math.min(width - 1, x + SOFT_EDGE); nx++) near[ny * width + nx] = 1
        }
      }
    }
    const ends = [rows[span[0]], rows[span[1]]]
    let stray = 0
    for (let y = 0; y < last; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (near[i] || colorDistance(colorOf(image, i), colorOf(after, i)) === 0) continue
        const above = x >= span[0] && x <= span[1] ? y < topRow + Math.round(tilt * (x - axis)) : y < ends[x < span[0] ? 0 : 1]
        if (!above || colorDistance(colorOf(base, i), colorOf(image, i)) === 0) stray++
      }
    }
    if (stray) fail(`${stray} px changed outside the opening, its soft edge and what colour alone paints above it`)
  }
  return failures
}
