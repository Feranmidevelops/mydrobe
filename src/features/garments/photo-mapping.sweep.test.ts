import { describe, expect, it } from 'vitest'
import { handsOverFront, type Rect, type Rgb, type RgbaImage } from './photo-mapping'

/*
 * Sweeps over whole families of hands, cuffs, collars, logos and buttons, at
 * the size the app works at: photos are read at up to 1200 pixels across, so
 * a top's front is a few hundred pixels wide. Each family is swept over its
 * sizes, positions and colours, so a rule that holds for only one of them
 * fails here.
 */

const WHITE: Rgb = [255, 255, 255]
const NAVY: Rgb = [36, 55, 94]

function blank(width: number, height: number, color: Rgb = WHITE): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4)
  return { data, width, height }
}

function paint(image: RgbaImage, { x, y, width, height }: Rect, color: Rgb) {
  for (let row = Math.max(0, y); row < Math.min(image.height, y + height); row++) {
    for (let column = Math.max(0, x); column < Math.min(image.width, x + width); column++) {
      image.data.set([...color, 255], (row * image.width + column) * 4)
    }
  }
}

/** Every combination of the given lists' items. */
function product<T extends unknown[][]>(...lists: T): { [K in keyof T]: T[K][number] }[] {
  return lists.reduce<unknown[][]>((combos, list) => combos.flatMap((combo) => list.map((item) => [...combo, item])), [
    [],
  ]) as { [K in keyof T]: T[K][number] }[]
}

describe('hands and cuffs at the size the app works at', () => {
  // A top held up on white: shoulders and short sleeves across the top, the body (the front crop) below.
  const [WIDTH, HEIGHT] = [480, 640]
  const crop: Rect = { x: 120, y: 160, width: 240, height: 440 }
  const BAND = 40
  const SKIN_TONES: Record<string, Rgb> = {
    light: [236, 196, 170],
    medium: [205, 150, 125],
    tan: [176, 122, 92],
    dark: [118, 80, 58],
  }
  const CUFF_COLORS: Record<string, Rgb> = { camel: [185, 138, 94], tan: [196, 160, 120], brown: [160, 112, 74] }
  /** How far a hand's fingers reach into the front. */
  const REACH = 40

  function top() {
    const image = blank(WIDTH, HEIGHT)
    paint(image, { x: 60, y: 160, width: 360, height: 120 }, NAVY)
    paint(image, crop, NAVY)
    return image
  }

  function handsIn(image: RgbaImage) {
    const solid = new Uint8Array(WIDTH * HEIGHT)
    for (let i = 0; i < solid.length; i++) if (image.data[i * 4] !== 255 || image.data[i * 4 + 2] !== 255) solid[i] = 1
    return handsOverFront(image, solid, crop, BAND, WHITE)
  }

  type Side = 'left' | 'right'
  interface Hand {
    side: Side
    y: number
    size: [number, number]
    tone: Rgb
    /** Whether a forearm runs on from the hand out to the photo's edge. */
    arm?: boolean
  }

  /** A hand gripping a side of the front, its fingers reaching REACH pixels in; returns a fingertip pixel. */
  function hand(image: RgbaImage, { side, y, size: [width, height], tone, arm }: Hand) {
    const x = side === 'right' ? crop.x + crop.width - REACH : crop.x + REACH - width
    paint(image, { x, y, width, height }, tone)
    if (arm) {
      const armY = y + Math.round(height * 0.2)
      const armHeight = Math.round(height * 0.6)
      if (side === 'right') paint(image, { x: x + width, y: armY, width: WIDTH, height: armHeight }, tone)
      else paint(image, { x: 0, y: armY, width: x, height: armHeight }, tone)
    }
    return [side === 'right' ? crop.x + crop.width - REACH / 2 : crop.x + REACH / 2, y + (height >> 1)] as const
  }

  /** Marks both hands, and nothing in the middle of the front. */
  function expectBothMarked(left: Hand, right: Hand) {
    const image = top()
    const fingertips = [hand(image, left), hand(image, right)]
    const hands = handsIn(image)
    for (const [x, y] of fingertips) expect(hands[y * WIDTH + x]).toBe(1)
    expect(hands[(crop.y + 300) * WIDTH + crop.x + 120]).toBe(0)
  }

  const SIZES: [number, number][] = [
    [96, 40],
    [128, 56],
    [160, 72],
  ]

  it.each(product([240, 360, 480], SIZES, Object.keys(SKIN_TONES)))(
    'marks two hands holding the sides level at %i, %j, %s skin',
    (y, size, tone) => {
      expectBothMarked(
        { side: 'left', y, size, tone: SKIN_TONES[tone] },
        { side: 'right', y, size, tone: SKIN_TONES[tone] },
      )
    },
  )

  it.each(product([0, 10, 30, 60, 120], [false, true]))(
    'marks two hands holding the sides %i px apart in height, with arms out to the edge: %s',
    (apart, arm) => {
      expectBothMarked(
        { side: 'left', y: 360, size: [128, 56], tone: SKIN_TONES.medium, arm },
        { side: 'right', y: 360 + apart, size: [128, 56], tone: SKIN_TONES.medium, arm },
      )
    },
  )

  it.each(product(Object.keys(SKIN_TONES), Object.keys(SKIN_TONES)))(
    'marks two hands of different sizes holding the sides, in %s and %s skin',
    (left, right) => {
      expectBothMarked(
        { side: 'left', y: 300, size: [96, 40], tone: SKIN_TONES[left] },
        { side: 'right', y: 320, size: [160, 72], tone: SKIN_TONES[right] },
      )
    },
  )

  it.each(product(SIZES, [false, true]))('marks two hands holding the hem corners, %j, with arms down: %s', (size, arm) => {
    const image = top()
    const [width, height] = size
    const y = crop.y + crop.height - height + 16
    const fingertips: [number, number][] = []
    for (const side of ['left', 'right'] as const) {
      const x = side === 'right' ? crop.x + crop.width - REACH : crop.x + REACH - width
      paint(image, { x, y, width, height }, SKIN_TONES.medium)
      if (arm) paint(image, { x: x + (width >> 2), y: y + height, width: width >> 1, height: HEIGHT }, SKIN_TONES.medium)
      fingertips.push([side === 'right' ? crop.x + crop.width - REACH / 2 : crop.x + REACH / 2, y + 8])
    }
    const hands = handsIn(image)
    for (const [x, fy] of fingertips) expect(hands[fy * WIDTH + x]).toBe(1)
  })

  /**
   * A long sleeve hanging beside the body, its cuff overlapping the front's
   * side by 8 pixels, and `hem` rows of the sleeve's colour showing past it.
   */
  function sleeve(image: RgbaImage, side: Side, cuffY: number, cuff: Rgb, [cuffWidth, cuffHeight] = [56, 60], hem = 0) {
    const x = side === 'right' ? crop.x + crop.width - 8 : crop.x + 8 - 56
    paint(image, { x, y: 280, width: 56, height: cuffY - 280 + cuffHeight + hem }, NAVY)
    paint(image, { x: x - ((cuffWidth - 56) >> 1), y: cuffY, width: cuffWidth, height: cuffHeight }, cuff)
  }

  it.each(product(Object.keys(CUFF_COLORS), [0, 20, 40, 80], [0, 2]))(
    'marks no cuffs of long sleeves in %s, one hanging %i px lower, with %i rows of the sleeve showing past them',
    (color, lower, hem) => {
      const image = top()
      sleeve(image, 'left', 480, CUFF_COLORS[color], undefined, hem)
      sleeve(image, 'right', 480 + lower, CUFF_COLORS[color], undefined, hem)
      expect(handsIn(image).reduce((sum, value) => sum + value, 0)).toBe(0)
    },
  )

  it.each(['left', 'right'] as const)('marks no single cuff on the %s, the other sleeve folded behind', (side) => {
    const image = top()
    sleeve(image, side, 480, CUFF_COLORS.camel)
    expect(handsIn(image).reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it('marks no cuffs when one is in shade, much darker than the other', () => {
    const image = top()
    sleeve(image, 'left', 480, CUFF_COLORS.camel)
    sleeve(image, 'right', 480, [130, 92, 60])
    expect(handsIn(image).reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it('marks no cuff rolled up wider and longer than the other', () => {
    const image = top()
    sleeve(image, 'left', 480, CUFF_COLORS.camel)
    sleeve(image, 'right', 450, CUFF_COLORS.camel, [72, 104])
    expect(handsIn(image).reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it.each(product(['left', 'right'] as const, [-30, 0, 30]))(
    'marks a hand on one side, with a cuff on the %s %i px from level with it',
    (cuffSide, offset) => {
      const image = top()
      sleeve(image, cuffSide, 470 + offset, CUFF_COLORS.tan)
      const [x, y] = hand(image, {
        side: cuffSide === 'left' ? 'right' : 'left',
        y: 470,
        size: [128, 56],
        tone: SKIN_TONES.medium,
      })
      const hands = handsIn(image)
      expect(hands[y * WIDTH + x]).toBe(1)
      // The cuff stays.
      const cuffX = cuffSide === 'left' ? crop.x + 2 : crop.x + crop.width - 3
      expect(hands[(500 + offset) * WIDTH + cuffX]).toBe(0)
    },
  )

  it('marks a hand lying across a sleeve hanging beside the body', () => {
    const image = top()
    paint(image, { x: 352, y: 280, width: 56, height: 300 }, NAVY)
    const [x, y] = hand(image, { side: 'right', y: 400, size: [128, 56], tone: SKIN_TONES.medium })
    expect(handsIn(image)[y * WIDTH + x]).toBe(1)
  })
})
