import { describe, expect, it } from 'vitest'
import { estimateBackground, garmentMask, type Rgb, type RgbaImage } from './photo-mapping'

/*
 * Trousers laid flat on a grey backdrop, drawn at the size photos are worked
 * on (1200 px tall), with the shade the legs cast on the backdrop at the top
 * of the gap between them. That shade is darker than the backdrop's colour
 * range reaches, so it's left as a sliver of garment unless something
 * opens it. Fabric that looks like the shade, a sheen down the inside of the
 * legs or a grey patch over the crotch, mustn't be opened with it.
 *
 * The tip is opened only as far up as both legs' edges are seen. Where a sheen
 * runs right up to a black or charcoal leg's inner edge, or grey trousers are
 * the colour of the shade, the leg's colour slopes away from the shade, or
 * doesn't change at all, rather than stepping, just as a sheen or a grey
 * patch over a rounded crotch does above its top. There the edges can't be
 * told from the fabric, so the tip above the backdrop's reach is left and only
 * the fabric is checked.
 */

const GREY: Rgb = [209, 209, 209]
const FABRICS: Record<string, Rgb> = {
  black: [30, 30, 33],
  charcoal: [70, 70, 72],
  navy: [63, 95, 138],
  denim: [80, 105, 145],
}

interface FlatLay {
  fabric: Rgb
  /** Straight legs, which part more slowly than A-line ones. */
  straight?: boolean
  /** Legs laid further apart, the gap between them widening this many times as fast. */
  spread?: number
  /** Turned this many degrees about the crotch. */
  turn?: number
  /** A sheen down the inside of each leg: strongest at the leg's inner edge, gone `width` px in, for 230 rows below the crotch. */
  sheen?: { strength: number; width: number }
  /** A soft grey patch of radius `radius` over the crotch, centred a little above it. */
  patch?: { radius: number; color: Rgb }
  backdrop?: Rgb
  /** How many rows below the crotch the legs lie touching before they part. */
  touching?: number
  /** How far down the photo the trousers lie, so far that the legs run off its bottom edge. */
  lower?: number
}

const WIDTH = 720
const HEIGHT = 1200
const MID = 360
const CROTCH = 461
const WAIST = 108
const HEM = 1100

/** Box-blurs `plane` (WIDTH x HEIGHT) three times over with radius `radius`, about a Gaussian blur. */
function blur(plane: Float32Array, radius: number) {
  const at = (v: number, size: number) => Math.min(size - 1, Math.max(0, v))
  const copy = new Float32Array(plane.length)
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < HEIGHT; y++) {
      let sum = 0
      for (let x = -radius; x <= radius; x++) sum += plane[y * WIDTH + at(x, WIDTH)]
      for (let x = 0; x < WIDTH; x++) {
        copy[y * WIDTH + x] = sum / (2 * radius + 1)
        sum += plane[y * WIDTH + at(x + radius + 1, WIDTH)] - plane[y * WIDTH + at(x - radius, WIDTH)]
      }
    }
    for (let x = 0; x < WIDTH; x++) {
      let sum = 0
      for (let y = -radius; y <= radius; y++) sum += copy[at(y, HEIGHT) * WIDTH + x]
      for (let y = 0; y < HEIGHT; y++) {
        plane[y * WIDTH + x] = sum / (2 * radius + 1)
        sum += copy[at(y + radius + 1, HEIGHT) * WIDTH + x] - copy[at(y - radius, HEIGHT) * WIDTH + x]
      }
    }
  }
}

/**
 * Draws the trousers, and says which pixels are fabric at least a pixel in
 * from the edge, and which are backdrop in the top 80 rows of the gap at least
 * 3 px clear of the legs: the sliver that must open. Fabric within 40 px of
 * the photo's edge isn't counted: tidying the mask trims a garment that runs
 * off the photo there, shade or no shade.
 */
function flatLay({ fabric, straight = false, spread = 1, turn = 0, sheen, patch, backdrop = GREY, touching = 0, lower = 0 }: FlatLay) {
  const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)]
  const crotch = CROTCH + lower
  // Where (x, y) lies before the turn, measured from the crotch: how far across, and how far down.
  const across = (x: number, y: number) => (x - MID) * cos + (y - crotch) * sin
  const down = (x: number, y: number) => (y - crotch) * cos - (x - MID) * sin
  // Half the gap between the legs, `below` rows under the crotch: the inner edges curve in to meet where they part.
  const gap = (below: number) => {
    const apart = Math.max(0, below - touching)
    return spread * (straight ? 0.06 * Math.sqrt(apart) + 0.045 * apart : 0.12 * Math.sqrt(apart) + 0.09 * apart)
  }
  // Half the trousers' width, `below` rows under the crotch (above it, less than 0).
  const outer = (below: number) => ((straight ? 19 : 93) * (below + CROTCH - WAIST)) / (HEM - WAIST) + (straight ? 158 : 169)
  const onTrousers = (x: number, y: number) => {
    const [u, v] = [Math.abs(across(x, y)), down(x, y)]
    return v >= WAIST - CROTCH && v <= HEM - CROTCH && u <= outer(v) && (v <= touching || u >= gap(v))
  }
  // How far (x, y) lies from the gap: across to the nearer leg's edge below the crotch, or from the crotch above it.
  const fromGap = (x: number, y: number) => {
    const [u, v] = [across(x, y), down(x, y)]
    return v <= 0 ? Math.hypot(u, v) : Math.max(0, Math.abs(u) - gap(v))
  }

  const total = WIDTH * HEIGHT
  const cover = new Float32Array(total)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let inside = 0
      for (let sy = 1; sy < 6; sy += 2) for (let sx = 1; sx < 6; sx += 2) if (onTrousers(x + sx / 6, y + sy / 6)) inside++
      cover[y * WIDTH + x] = inside / 9
    }
  }

  // The backdrop, with the trousers' cast shadow down and to the right and the shade at the top of the gap.
  const shadow = new Float32Array(total)
  for (let y = 5; y < HEIGHT; y++) for (let x = 4; x < WIDTH; x++) shadow[y * WIDTH + x] = cover[(y - 5) * WIDTH + x - 4]
  blur(shadow, 7)
  const layer = [0, 1, 2].map(() => new Float32Array(total))
  const alpha = cover.slice()
  for (let i = 0; i < total; i++) {
    if (!cover[i]) continue
    const [x, y] = [i % WIDTH, Math.floor(i / WIDTH)]
    let color = [...fabric]
    const mix = (to: Rgb, amount: number) => (color = color.map((c, k) => c + (to[k] - c) * Math.min(1, Math.max(0, amount))))
    if (sheen) {
      const v = down(x, y)
      const along = v <= 0 ? 1 : Math.min(1, Math.max(0, (230 - v) / 6))
      mix([255, 255, 255], sheen.strength * (1 - fromGap(x, y) / sheen.width) * along)
    }
    if (patch) {
      const out = Math.hypot(across(x, y), down(x, y) + 0.4 * patch.radius) / patch.radius
      if (out < 1) mix(patch.color, out < 0.45 ? 1 : (1 - out) / 0.55)
    }
    for (let k = 0; k < 3; k++) layer[k][i] = color[k] * cover[i]
  }
  for (const plane of [...layer, alpha]) blur(plane, 1)

  const data = new Uint8ClampedArray(total * 4)
  let seed = 7
  for (let i = 0; i < total; i++) {
    const [x, y] = [i % WIDTH, Math.floor(i / WIDTH)]
    const tip = 1 - 0.4 * Math.max(0, 1 - Math.hypot(x - MID + touching * sin, y - crotch - touching * cos) / 123)
    const lit = tip * (1 - 0.3 * shadow[i])
    seed = (seed * 16807) % 2147483647
    const noise = (seed / 2147483647 - 0.5) * 6
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(layer[k][i] + backdrop[k] * lit * (1 - alpha[i]) + noise)
    data[i * 4 + 3] = 255
  }

  const clear = (x: number, y: number, radius: number, covered: boolean) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const value = cover[(y + dy) * WIDTH + x + dx]
        if (covered ? value < 1 : value > 0) return false
      }
    }
    return true
  }
  const inFabric = new Uint8Array(total)
  const sliver = new Uint8Array(total)
  for (let y = 3; y < HEIGHT - 3; y++) {
    for (let x = 3; x < WIDTH - 3; x++) {
      const v = down(x + 0.5, y + 0.5)
      if (clear(x, y, 1, true)) inFabric[y * WIDTH + x] = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y) >= 40 ? 1 : 0
      else if (v > touching && v < touching + 80 && Math.abs(across(x + 0.5, y + 0.5)) < gap(v) && clear(x, y, 3, false)) {
        sliver[y * WIDTH + x] = 1
      }
    }
  }
  const image: RgbaImage = { data, width: WIDTH, height: HEIGHT }
  return { image, inFabric, sliver }
}

const TOLERANCES = [40, 70, 110]

/**
 * Draws `trousers` and cuts them out of the photo at each of `tolerances`,
 * returning a line for each cut that takes fabric or, at any of `opensAt`,
 * leaves any of the sliver. At 40 the backdrop stops short of the left leg in
 * the shadow it casts, so that leg's edge can't be seen and the sliver is
 * left as it was.
 */
function failures(label: string, trousers: FlatLay, tolerances = TOLERANCES, opensAt = [70, 110]) {
  const { image, inFabric, sliver } = flatLay(trousers)
  const background = estimateBackground(image)
  const found: string[] = []
  for (const tolerance of tolerances) {
    const mask = garmentMask(image, background, tolerance)
    let cut = 0
    let left = 0
    for (let i = 0; i < mask.length; i++) {
      if (inFabric[i] && !mask[i]) cut++
      if (sliver[i] && mask[i]) left++
    }
    if (cut > 0 || (opensAt.includes(tolerance) && left > 0)) found.push(`${label} at ${tolerance}: ${cut} fabric cut, ${left} sliver left`)
  }
  return found
}

describe('the shaded top of the gap between trouser legs, at the working size', () => {
  /**
   * The strongest sheen each fabric is tried with at each tolerance. A
   * stronger one at the leg's edge comes close enough to the grey backdrop
   * for the backdrop to run into it all down the leg, shade or no shade: a
   * matter for the cut itself, so it's left out.
   */
  const STRONGEST: Record<string, number[]> = {
    black: [0.5, 0.5, 0.35],
    charcoal: [0.5, 0.35, 0.25],
    navy: [0.5, 0.35, 0.15],
    denim: [0.5, 0.25, 0],
  }

  /** The fabrics whose sheen slopes away from the shade at the leg's edge, rather than stepping. */
  const SLOPED = ['black', 'charcoal']

  for (const [name, fabric] of Object.entries(FABRICS)) {
    it(`keeps a sheen down the legs and a patch over the crotch of ${name} trousers, and opens the sliver where their edges show`, () => {
      const found: string[] = []
      const opensAt = SLOPED.includes(name) ? [] : [70, 110]
      for (const strength of [0.15, 0.25, 0.35, 0.5]) {
        const tolerances = TOLERANCES.filter((_, k) => strength <= STRONGEST[name][k])
        for (const width of [5, 10, 20, 30]) {
          found.push(...failures(`${strength * 100}% sheen ${width} px wide`, { fabric, sheen: { strength, width } }, tolerances, opensAt))
        }
      }
      const color: Rgb = name === 'denim' ? [148, 150, 156] : [150, 150, 152]
      for (const radius of [15, 25, 35, 45, 55, 70]) found.push(...failures(`patch of radius ${radius}`, { fabric, patch: { radius, color } }))
      expect(found).toEqual([])
    }, 300_000)
  }

  it('keeps the fabric and opens the sliver however the trousers lie', () => {
    const SHEEN = { strength: 0.35, width: 20 }
    const PATCH = { radius: 40, color: [150, 150, 152] as Rgb }
    const ways: [string, FlatLay, number[]?][] = [
      ['with straight legs', { fabric: FABRICS.black, straight: true, sheen: SHEEN }],
      ['turned one way', { fabric: FABRICS.navy, turn: 4, patch: PATCH }],
      // A sheen on charcoal or black sloping away from the shade, as above.
      ['turned the other way', { fabric: FABRICS.charcoal, turn: -4, sheen: { strength: 0.2, width: 10 } }, []],
      ['with the legs running off the bottom of the photo', { fabric: FABRICS.black, straight: true, lower: 520, sheen: SHEEN }, [110]],
      // At 70 the shade reaches so far down these legs that too little of them shows below it to tell where they meet.
      ['with the legs running off the photo just below the shade', { fabric: FABRICS.black, straight: true, lower: 560, sheen: SHEEN }, [110]],
      ['with the legs laid further apart', { fabric: FABRICS.navy, spread: 2.5, patch: PATCH }],
      ['with the legs touching for a while below the crotch', { fabric: FABRICS.black, touching: 120, sheen: SHEEN }, []],
      // No gap opens, so nothing changes.
      ['with the legs touching all the way down', { fabric: FABRICS.charcoal, touching: HEM, sheen: SHEEN }],
      ['on a white backdrop', { fabric: FABRICS.navy, backdrop: [245, 245, 245], patch: PATCH }],
      // The shade's own colour, so the legs' edges don't show above the backdrop's reach.
      ['in grey, on the grey backdrop', { fabric: [110, 110, 112] }, []],
    ]
    expect(ways.flatMap(([label, trousers, opensAt]) => failures(label, trousers, TOLERANCES, opensAt))).toEqual([])
  }, 300_000)
})
