import type { Rgb, RgbaImage } from '../../src/features/garments/photo-mapping.ts'

/*
 * Synthetic flat-lay garment photos for the browser tests, drawn in plain
 * TypeScript so they come out the same on every machine and need no licence.
 * Coordinates are on a 900 x 1100 design canvas and scale to any size.
 *
 * Rules that keep them separating cleanly (see photo-mapping.ts):
 * - at least 40 px of backdrop on every side, and the garment covers well over 8% of the photo;
 * - every colour touching the outline sits more than 140 (2 x tolerance) from the backdrop;
 * - the cuffs stay well clear of the body on the hem rows, and the trouser legs part at the hem;
 * - the pocket stays under 8% of the garment (so it isn't a main colour) and clear of the fabric sample.
 *
 * The colours are strong red, green and blue so the tests can tell from a
 * screenshot which garment, and which part of its photo, is on the mannequin.
 */
export const DESIGN_SIZE = { width: 900, height: 1100 } as const

export const BACKDROP: Rgb = [238, 234, 226] // #eeeae2, a plain linen sheet
export const RED: Rgb = [198, 40, 40] // #c62828, named "red"
export const POCKET: Rgb = [27, 158, 58] // #1b9e3a, shows on the mannequin only when the photo itself is mapped
export const BLUE: Rgb = [30, 64, 175] // #1e40af, named "blue"
export const POCKET_RECT = { x: 470, y: 300, width: 80, height: 80 } as const

type Point = readonly [number, number]

/** Points along a quadratic curve, leaving out both ends. */
function curve(from: Point, control: Point, to: Point, segments: number): Point[] {
  return Array.from({ length: segments - 1 }, (_, i) => {
    const t = (i + 1) / segments
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    return [a * from[0] + b * control[0] + c * to[0], a * from[1] + b * control[1] + c * to[1]] as const
  })
}

/** A long-sleeve shirt laid flat, sleeves angled out and down. */
export const SHIRT_OUTLINE: Point[] = [
  [360, 150], ...curve([360, 150], [450, 250], [540, 150], 8), [540, 150], // neck opening
  [700, 190], // right shoulder
  [838, 610], [760, 650], // right cuff, outer then inner
  [668, 370], // right armpit
  [672, 955], ...curve([672, 955], [450, 995], [228, 955], 10), [228, 955], // side seams and curved hem
  [232, 370], // left armpit
  [140, 650], [62, 610], // left cuff, inner then outer
  [200, 190], // left shoulder
]

/** Straight trousers, front on, legs slightly apart. */
export const TROUSERS_OUTLINE: Point[] = [
  [285, 110], [615, 110], // waistband
  [628, 240], // right hip
  [660, 990], [492, 990], // right hem, outer then inner
  [450, 455], // crotch
  [408, 990], [240, 990], // left hem, inner then outer
  [272, 240], // left hip
]

const inPocket = (x: number, y: number) =>
  x >= POCKET_RECT.x && x < POCKET_RECT.x + POCKET_RECT.width && y >= POCKET_RECT.y && y < POCKET_RECT.y + POCKET_RECT.height

/** How much of each pixel the outline covers: exact along each row, 4 samples down it, like canvas anti-aliasing. */
function insideShare(outline: readonly Point[], width: number, height: number, rows = 4): Float32Array {
  const share = new Float32Array(width * height)
  for (let py = 0; py < height; py++) {
    for (let s = 0; s < rows; s++) {
      const y = py + (s + 0.5) / rows
      const crossings: number[] = []
      outline.forEach(([x1, y1], i) => {
        const [x2, y2] = outline[(i + 1) % outline.length]
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
      })
      crossings.sort((a, b) => a - b)
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const left = Math.max(0, crossings[k])
        const right = Math.min(width, crossings[k + 1])
        if (right <= left) continue
        const first = Math.floor(left)
        const last = Math.floor(right)
        const row = py * width
        if (first === last) {
          share[row + first] += (right - left) / rows
          continue
        }
        share[row + first] += (first + 1 - left) / rows
        for (let x = first + 1; x < last; x++) share[row + x] += 1 / rows
        if (last < width) share[row + last] += (right - last) / rows
      }
    }
  }
  return share
}

export interface PhotoSize {
  width: number
  height: number
}

function drawPhoto(outline: Point[], fabric: (x: number, y: number) => Rgb, size: PhotoSize = DESIGN_SIZE): RgbaImage {
  const { width, height } = size
  const sx = width / DESIGN_SIZE.width
  const sy = height / DESIGN_SIZE.height
  const share = insideShare(outline.map(([x, y]) => [x * sx, y * sy] as const), width, height)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = py * width + px
      const amount = Math.min(1, share[i])
      const color = amount > 0 ? fabric((px + 0.5) / sx, (py + 0.5) / sy) : BACKDROP
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(BACKDROP[c] * (1 - amount) + color[c] * amount)
      data[i * 4 + 3] = 255
    }
  }
  return { data, width, height }
}

export const shirtPhoto = (size?: PhotoSize) => drawPhoto(SHIRT_OUTLINE, (x, y) => (inPocket(x, y) ? POCKET : RED), size)
export const trousersPhoto = (size?: PhotoSize) => drawPhoto(TROUSERS_OUTLINE, () => BLUE, size)

/**
 * What the review step suggests for each photo, and the names the tests give
 * them (so their cards can't be confused with the demo pieces).
 */
export const EXPECTED = {
  shirt: { file: 'red-shirt.png', suggested: 'Red shirt', name: 'My red shirt' },
  trousers: { file: 'blue-trousers.png', suggested: 'Blue trousers', chip: 'Trousers', name: 'My blue trousers' },
} as const
