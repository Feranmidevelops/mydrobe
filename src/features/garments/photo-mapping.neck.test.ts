import { describe, expect, it } from 'vitest'
import type { HangingTop } from '../../test/hanging-top'
import { neckFailures } from '../../test/neck-failures'
import type { Rgb } from './photo-mapping'

/*
 * The neck of a hanging top painted over at the app's size, through the soft
 * edges a photo's blur and lossy round trip leave, turned a few degrees, off
 * centre and small: everything seen through the opening goes, and nothing on
 * the front below the neckline changes (see neckFailures).
 */

const WOOD: Rgb = [150, 100, 60]
const PLASTIC: Rgb = [30, 30, 32]
const INK: Rgb = [30, 30, 40]

/** Plain tops, each with the colours of the things drawn on and behind it. */
const TOPS: Record<string, { top: HangingTop; rib: Rgb; ink: Rgb; label: Rgb; print: Rgb; button: Rgb }> = {
  cream: { top: { color: [236, 232, 224], shade: 0.6 }, rib: [36, 55, 94], ink: [200, 40, 40], label: INK, print: [240, 240, 240], button: [60, 50, 45] },
  'white tee': { top: { color: [200, 205, 210], shade: 0.6 }, rib: [36, 55, 94], ink: INK, label: [225, 228, 232], print: INK, button: [60, 60, 60] },
}

/** The ways a photo of a top comes out: softness, turn, shift and scale, taken in turn. */
const PHOTOS: Pick<HangingTop, 'softness' | 'turn' | 'shift' | 'scale'>[] = [
  { softness: 'none', turn: 0, shift: 0, scale: 1 },
  { softness: 'jpeg', turn: 3, shift: 25, scale: 1 },
  { softness: 'webp', turn: -5, shift: -60, scale: 1 },
  { softness: 'jpeg', turn: 0, shift: 60, scale: 0.5 },
  { softness: 'webp', turn: -3, shift: 0, scale: 1 },
]

const NECKLINES = ['U', 'scoop', 'square', 'V'] as const

/** Every failure over the tops, each drawn in turn as each of the photos and necklines. */
function failures(make: (colours: (typeof TOPS)[string]) => [string, Partial<HangingTop>][]) {
  const lines: string[] = []
  let n = 0
  for (const [name, colours] of Object.entries(TOPS)) {
    for (const [label, top] of make(colours)) {
      const photo = PHOTOS[n % PHOTOS.length]
      const neckline = NECKLINES[n++ % NECKLINES.length]
      const scene = { ...colours.top, neckline, ...photo, ...top }
      const what = `${label} on a ${scene.neckline} ${name}, ${photo.softness} turned ${photo.turn}° ${photo.shift} px off centre at scale ${scene.scale}`
      lines.push(...neckFailures(what, scene, { found: true }))
    }
  }
  return lines
}

describe('painting over what shows through a neck opening', () => {
  it('paints over a hanger bar lying in the opening, in wood or plastic, and its hook, but not the collar round it', () => {
    expect(
      failures(({ rib }) => [
        ['a wooden bar', { rib: { width: 10, color: rib }, behind: [{ kind: 'bar', color: WOOD, thick: 14, above: 12 }] }],
        ['a plastic bar and its hook', { neckline: 'scoop', rib: { width: 10, color: rib }, behind: [{ kind: 'bar', color: PLASTIC, thick: 10, above: 12 }, { kind: 'hook', color: [140, 140, 145] }] }],
      ]),
    ).toEqual([])
  }, 600_000)

  it('paints over a label and its printed word, at full and half size, but not the collar round it', () => {
    expect(
      failures(({ label, print, rib }) => [
        ['a label', { rib: { width: 10, color: rib }, behind: [{ kind: 'label', color: label, print }] }],
        ['a half-size label', { rib: { width: 10, color: rib }, behind: [{ kind: 'label', color: label, print, size: 0.5 }] }],
      ]),
    ).toEqual([])
  }, 600_000)

  it('paints over a hanger bar whose middle third a label hides, but not the collar round it', () => {
    expect(
      failures(({ label, rib }) => [['a bar under a label', { rib: { width: 10, color: rib }, behind: [{ kind: 'bar', color: WOOD, thick: 14, above: 12 }, { kind: 'label', color: label, over: 'bar' }] }]]),
    ).toEqual([])
  }, 600_000)

  it('paints over the inside of the back, leaving the highlight along the back of the collar no greyer than before, and the front’s collar', () => {
    expect(
      failures(({ top, rib }) => [
        ['the back’s rib', { rib: { width: 10, color: rib }, behind: [{ kind: 'back rib', color: top.color.map((v) => Math.min(255, v * 1.04)) as Rgb, highlight: top.color.map((v) => Math.min(255, v + 45)) as Rgb }] }],
      ]),
    ).toEqual([])
  }, 600_000)
})

describe('leaving the front below the neckline alone', () => {
  it('keeps a contrasting rib or collar along the neckline, 4 to 10 px wide', () => {
    expect(
      failures(({ rib, label, print }) =>
        [4, 6, 10].map((width) => [`a ${width} px rib`, { rib: { width, color: rib }, behind: [{ kind: 'label', color: label, print, size: 0.5 }], scale: 1 }]),
      ),
    ).toEqual([])
  }, 600_000)

  it('keeps a contrasting collar running up to the shoulders round a round or square neck opening narrower than a fifth of the front', () => {
    expect(
      failures(({ rib }) =>
        [38, 40, 44].flatMap((half) =>
          [8, 12].map((width): [string, Partial<HangingTop>] => [
            `a ${width} px collar round an opening ${2 * half} px wide`,
            // The collar's sides carry on up past the opening's to the top of the front, as a tee's do.
            {
              half,
              neckline: (['U', 'scoop', 'square'] as const)[(half + width) % 3],
              rib: { width, color: rib },
              front: [{ kind: 'stripes', width, apart: half + width / 2, color: rib }],
              scale: 1,
            },
          ]),
        ),
      ),
    ).toEqual([])
  }, 600_000)

  it('keeps a collar’s shaded inner rim', () => {
    expect(
      failures(({ rib }) => [['a collar with a shaded rim', { rib: { width: 8, color: rib, rim: rib.map((v) => v * 0.55) as Rgb }, scale: 1 }]]),
    ).toEqual([])
  }, 600_000)

  it('keeps logos straddling the bottom of the band, beside the opening or under it, however wide', () => {
    const sizes = [
      [12, 10],
      [20, 14],
      [40, 16],
      [80, 16],
    ] as const
    expect(
      failures(({ ink }) =>
        sizes.flatMap(([width, height]) =>
          (['side', 'centre'] as const).map((at): [string, Partial<HangingTop>] => [
            `a ${width} x ${height} logo at the ${at}`,
            { depth: at === 'centre' ? -8 : 0, front: [{ kind: 'logo', width, height, below: 0.5, at, color: ink }] },
          ]),
        ),
      ),
    ).toEqual([])
  }, 600_000)

  it('keeps a top button 0 to 2 px under a collar’s lowest point, the collar in a shade of the top, and the placket under it', () => {
    expect(
      failures(({ button, top }) =>
        [0, 1, 2].map((gap) => [
          `a button ${gap} px under the neckline`,
          { rib: { width: 6, color: top.color.map((v) => v * 0.9) as Rgb }, front: [{ kind: 'button', size: 12, gap, color: button }, { kind: 'placket', width: 24, color: top.color.map((v) => v * 0.97) as Rgb }] },
        ]),
      ),
    ).toEqual([])
  }, 600_000)

  it('keeps a detail under a label’s print, or beside it, just under the neckline', () => {
    expect(
      failures(({ label, print }) =>
        [false, true].map((beside) => [
          `a detail ${beside ? 'beside' : 'under'} a label’s print`,
          { front: [{ kind: 'detail', width: 48, height: 8, beside, color: [60, 60, 60] }], behind: [{ kind: 'label', color: label, print, printAt: 0.85 }], scale: 1, neckline: 'U' },
        ]),
      ),
    ).toEqual([])
  }, 600_000)
})
