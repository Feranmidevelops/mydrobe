import { describe, expect, it } from 'vitest'
import { coverNeckOpening, handsOverFront, type Rect, type Rgb, type RgbaImage } from './photo-mapping'

/*
 * Sweeps over whole families of hands, cuffs, collars, logos and buttons, at
 * the size the app works at: photos are read at up to 1200 pixels across, so
 * a top's front is a few hundred pixels wide. Each family is swept over its
 * sizes, positions and colours, so a rule that holds for only one of them
 * fails here.
 */

const WHITE: Rgb = [255, 255, 255]
const NAVY: Rgb = [36, 55, 94]
const CREAM: Rgb = [236, 232, 224]

function blank(width: number, height: number, color: Rgb = WHITE): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4)
  return { data, width, height }
}

function colorAt(image: RgbaImage, x: number, y: number): Rgb {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2]]
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

describe('the neck opening at the size the app works at', () => {
  // A front as a shirt's comes out of a photo, with the neck opening showing in its top BAND rows: the
  // shoulders' rows, and the neckline's dip of 3% of the front's height below them.
  const [WIDTH, HEIGHT, BAND] = [455, 600, 60]
  const SHOULDERS = BAND - 18
  const CENTRE = 228
  const WOOD: Rgb = [150, 100, 60]

  function cover(front: RgbaImage, fabric: Rgb = CREAM) {
    return coverNeckOpening(front, BAND, blank(16, 16, fabric), fabric)
  }

  /** How many pixels differ between two images of the same size. */
  function changed(a: RgbaImage, b: RgbaImage) {
    let count = 0
    for (let i = 0; i < a.data.length; i += 4) {
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) count++
    }
    return count
  }

  /**
   * A contrasting collar `width` across, its curve ending `below` rows below
   * the band and `thick` rows thick, its sides running up into the neckline,
   * `above` rows past the shoulders.
   */
  function collar(width: number, above: number, below: number, thick: number) {
    const front = blank(WIDTH, HEIGHT, CREAM)
    const [x, y] = [CENTRE - (width >> 1), SHOULDERS - above]
    const height = BAND + below - y
    paint(front, { x, y, width: 10, height }, NAVY)
    paint(front, { x: x + width - 10, y, width: 10, height }, NAVY)
    paint(front, { x, y: y + height - thick, width, height: thick }, NAVY)
    return front
  }

  it.each(product([60, 100, 120, 150, 200], [0, 6, 12], [2, 4, 10], [6, 12]))(
    'keeps a collar %i across, its sides running up %i rows past the shoulders, ending %i rows below the band, %i thick',
    (width, above, below, thick) => {
      const front = collar(width, above, below, thick)
      expect(changed(front, cover(front))).toBe(0)
    },
  )

  it('paints over a hanger bar a label hides the middle of, though that leaves it thicker at its ends', () => {
    const front = blank(WIDTH, HEIGHT, CREAM)
    paint(front, { x: 80, y: 52, width: 300, height: 12 }, WOOD)
    paint(front, { x: 155, y: 30, width: 150, height: 30 }, [40, 40, 60])
    const covered = cover(front)
    for (const [x, y] of [
      [85, 54],
      [230, 62],
      [375, 54],
    ]) {
      expect(colorAt(covered, x, y)).toEqual(CREAM)
    }
  })

  /** Shirts with something bar-shaped in a darker shade across the neck, and buttons in a darker shade still. */
  const BARRED: Record<string, { shirt: Rgb; bar: Rgb; thick: number; buttons: Rgb[] }> = {
    'grey inside of a white shirt': { shirt: [235, 235, 240], bar: [120, 120, 125], thick: 30, buttons: [[30, 30, 30], [60, 60, 60]] },
    'navy-shaded inside of a light blue shirt': { shirt: [170, 195, 225], bar: [80, 95, 115], thick: 30, buttons: [[30, 40, 70]] },
    'wooden hanger bar on a cream shirt': { shirt: CREAM, bar: WOOD, thick: 24, buttons: [[95, 62, 35], [70, 45, 25]] },
  }
  const buttonCases = Object.entries(BARRED).flatMap(([name, { thick, buttons }]) =>
    product([name], buttons.map((button) => button.join()), [Math.round(thick * 0.45), Math.round(thick * 0.6)], [0, 1, 2]),
  )

  it.each(buttonCases)('keeps a top button by the %s, in %s, %i px across and %i px clear of it', (name, button, size, gap) => {
    const { shirt, bar, thick } = BARRED[name]
    const color = button.split(',').map(Number) as Rgb
    const front = blank(WIDTH, HEIGHT, shirt)
    const y = 16
    paint(front, { x: 120, y, width: 200, height: thick }, bar)
    // The top button, beside the end of the bar and within its rows, and the shirt's other buttons lower down.
    const [x, top] = [320 + gap, y + ((thick - size) >> 1)]
    paint(front, { x, y: top, width: size, height: size }, color)
    for (let lower = 150; lower < 580; lower += 110) paint(front, { x: 220, y: lower, width: size, height: size }, color)
    const covered = cover(front, shirt)
    expect(colorAt(covered, 220, y + (thick >> 1))).toEqual(shirt)
    expect(colorAt(covered, x + (size >> 1), top + (size >> 1))).toEqual(color)
  })

  it.each(product([24, 40], [2, 4], ['60,60,60', '95,95,100'], [[48, 8], [30, 14]] as [number, number][]))(
    'keeps a detail just under a label’s print %i px wide whose foot shows %i rows below the band, in %s, %j',
    (printWidth, foot, detailColor, [detailWidth, detailHeight]) => {
      // A white tee, its label's dark print straddling the band, and a detail touching the print's foot from below.
      const FABRIC: Rgb = [200, 205, 210]
      const color = detailColor.split(',').map(Number) as Rgb
      const front = blank(WIDTH, HEIGHT, FABRIC)
      const printY = BAND + foot - 12
      paint(front, { x: CENTRE - (printWidth >> 1), y: printY, width: printWidth, height: 12 }, [30, 30, 30])
      const detailY = BAND + foot
      paint(front, { x: CENTRE - (detailWidth >> 1), y: detailY, width: detailWidth, height: detailHeight }, color)
      const covered = cover(front, FABRIC)
      expect(colorAt(covered, CENTRE, printY + 4)).toEqual(FABRIC)
      expect(colorAt(covered, CENTRE, detailY + (detailHeight >> 1))).toEqual(color)
    },
  )
})
