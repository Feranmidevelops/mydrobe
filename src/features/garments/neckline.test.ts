import { describe, expect, it } from 'vitest'
import { hangingTop, type HangingTop } from '../../test/hanging-top'
import { findNeckline, type Neckline } from './neckline'
import type { Rgb } from './photo-mapping'

/*
 * The neckline traced on drawn tops at the app's size, through the soft edges
 * a photo's blur and lossy round trip leave, turned a few degrees, off centre
 * and small.
 */

const CREAM: Rgb = [236, 232, 224]
const NAVY: Rgb = [36, 55, 94]
const WHITE_TEE: Rgb = [200, 205, 210]
const INK: Rgb = [30, 30, 40]

/** The ways a photo of a top comes out: [softness, turn, shift]. */
const PHOTOS: [HangingTop['softness'], number, number][] = [
  ['none', 0, 0],
  ['jpeg', 3, 25],
  ['webp', -5, -60],
  ['jpeg', 5, 60],
  ['webp', -3, 0],
]

/**
 * The points of a line given as a row per column: each column's, and each row
 * of the climbs between neighbours, its ends climbing to the top of the front.
 */
function boundary(rows: Int16Array, keep: (x: number, y: number) => boolean = () => true) {
  const points: [number, number][] = []
  const at = (x: number) => (x < 0 || x >= rows.length || rows[x] < 0 ? 0 : rows[x])
  for (let x = -1; x < rows.length; x++) {
    if (x >= 0 && rows[x] >= 0 && keep(x, rows[x])) points.push([x, rows[x]])
    if (at(x) === at(x + 1)) continue
    for (let y = Math.min(at(x), at(x + 1)); y < Math.max(at(x), at(x + 1)); y++) if (keep(x, y)) points.push([x + 0.5, y])
  }
  return points
}

/**
 * How far, at most, the found neckline strays from another, along the stretch
 * it traced (from its top row down) over the other's columns.
 */
function strayFrom(found: Neckline, drawn: Int16Array) {
  const truth = boundary(drawn)
  const traced = boundary(found.rows, (x, y) => drawn[x] >= 0 && y >= found.topRow + Math.round(found.tilt * (x - found.axis)))
  let worst = 0
  for (const [x, y] of traced) {
    let nearest = Infinity
    for (const [tx, ty] of truth) nearest = Math.min(nearest, Math.max(Math.abs(tx - x), Math.abs(ty - y)))
    worst = Math.max(worst, nearest)
  }
  return worst
}

function found(top: HangingTop) {
  const drawn = hangingTop(top)
  return { drawn, neckline: findNeckline(drawn.image, drawn.band) }
}

describe('findNeckline', () => {
  const tops: [string, HangingTop][] = [
    ['a cream top', { color: CREAM, shade: 0.6, behind: [{ kind: 'label', color: INK, print: [240, 240, 240] }] }],
    ['a navy top', { color: NAVY, shade: 0.6, behind: [{ kind: 'label', color: [240, 240, 240], print: INK, size: 0.5 }] }],
    ['a white tee', { color: WHITE_TEE, shade: 0.6, behind: [{ kind: 'label', color: [225, 228, 232], print: INK, size: 0.5 }] }],
  ]
  const cases = (['U', 'scoop', 'square', 'V'] as const).flatMap((neckline, n) =>
    PHOTOS.map(([softness, turn, shift], k) => {
      const [name, top] = tops[(n + k) % tops.length]
      return [`${neckline} neckline on ${name}, as a ${softness} turned ${turn}° and ${shift} px off centre`, { ...top, neckline, softness, turn, shift }] as const
    }),
  )

  it.each(cases)('finds the drawn %s within 2 px, its centre line within 2 px', (_, top) => {
    const { drawn, neckline } = found(top)
    expect(neckline).not.toBeNull()
    if (!neckline) return
    expect(strayFrom(neckline, drawn.neckline)).toBeLessThanOrEqual(2)
    // The drawn top turns about its neckline's ends, 14 rows above the shoulders' row the centre line is found at.
    expect(Math.abs(neckline.axis - (drawn.axis - 14 * drawn.tilt))).toBeLessThanOrEqual(2)
  })

  it.each(['U', 'scoop', 'square', 'V'] as const)('reads the same %s neckline from a PNG, a JPEG and a WebP, within 2 px', (neckline) => {
    const lines = (['none', 'jpeg', 'webp'] as const).map((softness) => found({ ...tops[0][1], neckline, softness, turn: 3 }).neckline)
    for (const line of lines) expect(line).not.toBeNull()
    for (const line of lines.slice(1)) if (line && lines[0]) expect(strayFrom(line, lines[0].rows)).toBeLessThanOrEqual(2)
  })

  it.each([
    [6, 1],
    [8, 1],
    [10, 1],
  ])('resolves a contrasting rib %i px wide at scale %f to its inner edge', (width, scale) => {
    for (const [softness, turn, shift] of PHOTOS.slice(0, 3)) {
      const { drawn, neckline } = found({ color: CREAM, shade: 0.6, rib: { width, color: NAVY }, behind: [{ kind: 'label', color: INK, print: [240, 240, 240] }], softness, turn, shift, scale })
      expect(neckline, `${softness} ${turn}°`).not.toBeNull()
      if (neckline) expect(strayFrom(neckline, drawn.neckline), `${softness} ${turn}°`).toBeLessThanOrEqual(2)
    }
  })

  /** Whether every pixel of `region` lies at or below the neckline. */
  function belowLine(neckline: Neckline, region: Uint8Array, width: number) {
    for (let i = 0; i < region.length; i++) {
      const [x, y] = [i % width, Math.floor(i / width)]
      if (region[i] && neckline.rows[x] >= 0 && y < neckline.rows[x]) return false
    }
    return true
  }

  it.each([1])('keeps a top button and a detail 1 px under the lowest point below the line, at scale %f', (scale) => {
    for (const [softness, turn, shift] of PHOTOS) {
      for (const [thing, top] of [
        ['button', { color: CREAM, front: [{ kind: 'button', size: 12, gap: 1, color: [60, 50, 45] }] }],
        ['detail', { color: WHITE_TEE, front: [{ kind: 'detail', width: 48, height: 8, color: [60, 60, 60] }], behind: [{ kind: 'label', color: [225, 228, 232], print: INK, printAt: 0.85 }] }],
      ] as const) {
        const { drawn, neckline } = found({ ...(top as unknown as HangingTop), shade: 0.6, softness, turn, shift, scale })
        if (neckline) expect(belowLine(neckline, drawn.regions[thing], drawn.image.width), `${thing}, ${softness} ${turn}°`).toBe(true)
      }
    }
  })

  it.each([1, 0.5])('keeps the shaded inner rim of a collar below the line, at scale %f', (scale) => {
    for (const [softness, turn, shift] of PHOTOS) {
      const { drawn, neckline } = found({ color: CREAM, shade: 0.85, rib: { width: 8, color: NAVY, rim: [20, 30, 55] }, softness, turn, shift, scale })
      expect(neckline, `${softness} ${turn}°`).not.toBeNull()
      if (neckline) expect(belowLine(neckline, drawn.regions.rim, drawn.image.width), `${softness} ${turn}°`).toBe(true)
    }
  })

  it.each<[string, HangingTop]>([
    ['plain fabric', { color: CREAM, opening: false }],
    ['a check', { color: [150, 40, 40], weave: 'check', check: [40, 40, 60], opening: false }],
    ['a logo straddling the band', { color: CREAM, opening: false, front: [{ kind: 'logo', width: 80, height: 16, below: 0.5, at: 'centre', color: [200, 40, 40] }] }],
    ...([68, 76, 84] as const).map((width): [string, HangingTop] => [
      `a patch ${width} px wide from above the shoulders to below the band, as narrow as a label`,
      { color: CREAM, opening: false, front: [{ kind: 'patch', width, top: 20, bottom: 70, color: NAVY }] },
    ]),
    ['a panel down the middle', { color: CREAM, opening: false, front: [{ kind: 'panel', width: 90, color: NAVY }] }],
    ['two stripes down the front', { color: CREAM, opening: false, front: [{ kind: 'stripes', width: 6, apart: 45, color: NAVY }] }],
    ['an opening whose left side is black on black', { color: [25, 25, 28], shade: 0.4, hidden: 'left' }],
  ])('finds no neckline on %s', (_, top) => {
    for (const [softness, turn, shift] of PHOTOS.slice(0, 3)) expect(found({ ...top, softness, turn, shift }).neckline, `${softness} ${turn}°`).toBeNull()
  })
})
