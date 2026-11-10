import type { Rgb, RgbaImage } from '../features/garments/photo-mapping'

/*
 * Trousers laid flat on a backdrop, drawn the way a photo of them comes to the
 * analysis: at its working size, with the shade the legs cast on the backdrop
 * at the top of the gap between them, the weave, a slight blur and sensor
 * noise, and put through a lossy round trip like a JPEG's or a WebP's. The
 * crotch can be pointed, rounded, flat-topped or curved, and the legs can
 * carry a sheen down their inner edges or a faded patch over the crotch.
 */

/** Half the gap between the legs, `d` px below where they part: -Infinity where they don't (above it). */
export type Crotch =
  | { kind: 'pointed'; k: number }
  | { kind: 'rounded'; radius: number; k: number }
  | { kind: 'flat'; half: number; k: number }
  | { kind: 'curved'; a: number; k: number }
  | { kind: 'flared'; q: number; k: number }

export interface FlatLay {
  fabric: Rgb
  backdrop?: Rgb
  crotch?: Crotch
  /** Turned this many degrees about the crotch. */
  turn?: number
  /** Lightened towards white by up to `strength` at each leg's inner edge (and over the crotch), fading out `width` px in. */
  sheen?: { strength: number; width: number }
  /** A soft round patch of `color`, solid to 45% of `radius`, centred `dx` across and `dy` down from the crotch. */
  patch?: { radius: number; color: Rgb; dx?: number; dy?: number }
  /** The lossy round trip the photo went through. */
  softness?: 'jpeg' | 'webp' | 'none'
}

export const WIDTH = 720
export const HEIGHT = 1200
const MID = 360
const CROTCH = 470
const WAIST = 100
const HIP = 300
const LEG = 600
const [WAIST_HALF, HIP_HALF, HEM_HALF] = [175, 198, 255]

/** Half the gap `d` px below the crotch's top, and where that top lies below the point the legs' straight edges would meet. */
function gapOf(crotch: Crotch): { top: number; half: (d: number) => number } {
  const { k } = crotch
  switch (crotch.kind) {
    case 'pointed':
      return { top: 0, half: (d) => (d < 0 ? -Infinity : k * d) }
    case 'flat':
      return { top: 0, half: (d) => (d < 0 ? -Infinity : crotch.half + k * d) }
    case 'curved':
      return { top: 0, half: (d) => (d < 0 ? -Infinity : crotch.a * Math.sqrt(d) + k * d) }
    case 'flared':
      return { top: 0, half: (d) => (d < 0 ? -Infinity : k * d + crotch.q * d * d) }
    case 'rounded': {
      // A circle of the radius, touching both straight edges.
      const r = crotch.radius
      const centre = r / Math.sin(Math.atan(k))
      const touch = centre * Math.cos(Math.atan(k)) ** 2
      return {
        top: centre - r,
        half: (d) => (d < centre - r ? -Infinity : d >= touch ? k * d : Math.sqrt(Math.max(0, r * r - (d - centre) ** 2))),
      }
    }
  }
}

/** Separable Gaussian blur of `plane` (WIDTH x HEIGHT). */
function gaussian(plane: Float32Array, sigma: number) {
  const reach = Math.ceil(sigma * 3)
  const kernel = Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * sigma * sigma)))
  const sum = kernel.reduce((a, b) => a + b)
  const weights = kernel.map((w) => w / sum)
  const across = new Float32Array(plane.length)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let total = 0
      for (let i = -reach; i <= reach; i++) total += weights[i + reach] * plane[y * WIDTH + Math.min(WIDTH - 1, Math.max(0, x + i))]
      across[y * WIDTH + x] = total
    }
  }
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let total = 0
      for (let i = -reach; i <= reach; i++) total += weights[i + reach] * across[Math.min(HEIGHT - 1, Math.max(0, y + i)) * WIDTH + x]
      plane[y * WIDTH + x] = total
    }
  }
}

/** Box-blurs `plane` three times over with radius `radius`: about a Gaussian. */
function boxBlur(plane: Float32Array, radius: number) {
  const copy = new Float32Array(plane.length)
  const at = (v: number, size: number) => Math.min(size - 1, Math.max(0, v))
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

/** Smooth value noise in -1..1 with features about `cell` px across. */
function valueNoise(cell: number, seed: number) {
  const random = randoms(seed)
  const columns = Math.ceil(WIDTH / cell) + 2
  const grid = Float32Array.from({ length: columns * (Math.ceil(HEIGHT / cell) + 2) }, () => random() * 2 - 1)
  const ease = (t: number) => t * t * (3 - 2 * t)
  const out = new Float32Array(WIDTH * HEIGHT)
  for (let y = 0; y < HEIGHT; y++) {
    const [gy, ty] = [Math.floor(y / cell), ease(y / cell - Math.floor(y / cell))]
    for (let x = 0; x < WIDTH; x++) {
      const [gx, tx] = [Math.floor(x / cell), ease(x / cell - Math.floor(x / cell))]
      const at = (dx: number, dy: number) => grid[(gy + dy) * columns + gx + dx]
      out[y * WIDTH + x] = (at(0, 0) + (at(1, 0) - at(0, 0)) * tx) * (1 - ty) + (at(0, 1) + (at(1, 1) - at(0, 1)) * tx) * ty
    }
  }
  return out
}

function randoms(seed: number) {
  let state = seed
  return () => (state = (state * 16807) % 2147483647) / 2147483647
}

const JPEG_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22,
  37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]
const JPEG_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99]

/** Rounds each `n` x `n` block of `plane` (`width` x `height`) to steps of `steps` in its cosine transform. */
function quantise(plane: Float32Array, width: number, height: number, n: number, steps: number[]) {
  const basis = new Float64Array(n * n)
  for (let u = 0; u < n; u++) {
    for (let x = 0; x < n; x++) basis[u * n + x] = Math.sqrt((u === 0 ? 1 : 2) / n) * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n))
  }
  const [block, half, coefficients] = [0, 0, 0].map(() => new Float64Array(n * n))
  for (let by = 0; by < height; by += n) {
    for (let bx = 0; bx < width; bx += n) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) block[y * n + x] = plane[Math.min(height - 1, by + y) * width + Math.min(width - 1, bx + x)] - 128
      }
      for (let u = 0; u < n; u++) {
        for (let x = 0; x < n; x++) {
          let sum = 0
          for (let y = 0; y < n; y++) sum += basis[u * n + y] * block[y * n + x]
          half[u * n + x] = sum
        }
      }
      for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
          let sum = 0
          for (let x = 0; x < n; x++) sum += half[u * n + x] * basis[v * n + x]
          const step = steps[u * n + v]
          coefficients[u * n + v] = Math.round(sum / step) * step
        }
      }
      for (let y = 0; y < n; y++) {
        for (let v = 0; v < n; v++) {
          let sum = 0
          for (let u = 0; u < n; u++) sum += basis[u * n + y] * coefficients[u * n + v]
          half[y * n + v] = sum
        }
      }
      for (let y = 0; y < n && by + y < height; y++) {
        for (let x = 0; x < n && bx + x < width; x++) {
          let sum = 0
          for (let v = 0; v < n; v++) sum += half[y * n + v] * basis[v * n + x]
          plane[(by + y) * width + bx + x] = sum + 128
        }
      }
    }
  }
}

/**
 * A lossy round trip at quarter-resolution colour: a JPEG's 8 x 8 blocks at
 * quality 85, or a WebP's finer 4 x 4 ones.
 */
function lossy([red, green, blue]: Float32Array[], kind: 'jpeg' | 'webp') {
  const total = WIDTH * HEIGHT
  const luma = new Float32Array(total)
  const [cb, cr] = [new Float32Array(total), new Float32Array(total)]
  for (let i = 0; i < total; i++) {
    luma[i] = 0.299 * red[i] + 0.587 * green[i] + 0.114 * blue[i]
    cb[i] = 128 - 0.168736 * red[i] - 0.331264 * green[i] + 0.5 * blue[i]
    cr[i] = 128 + 0.5 * red[i] - 0.418688 * green[i] - 0.081312 * blue[i]
  }
  const [w, h] = [WIDTH / 2, HEIGHT / 2]
  const halve = (plane: Float32Array) => {
    const small = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = 2 * y * WIDTH + 2 * x
        small[y * w + x] = (plane[i] + plane[i + 1] + plane[i + WIDTH] + plane[i + WIDTH + 1]) / 4
      }
    }
    return small
  }
  const [smallCb, smallCr] = [halve(cb), halve(cr)]
  const scale = (table: number[]) => table.map((t) => Math.max(1, Math.floor((t * 30 + 50) / 100)))
  if (kind === 'jpeg') {
    quantise(luma, WIDTH, HEIGHT, 8, scale(JPEG_LUMA))
    for (const plane of [smallCb, smallCr]) quantise(plane, w, h, 8, scale([...JPEG_CHROMA, ...new Array<number>(36).fill(99)]))
  } else {
    quantise(luma, WIDTH, HEIGHT, 4, [5, ...new Array<number>(15).fill(7)])
    for (const plane of [smallCb, smallCr]) quantise(plane, w, h, 4, [7, ...new Array<number>(15).fill(10)])
  }
  // Back up to full size, each pixel blending the four nearest quarter-size ones.
  const near = (size: number, small: number) => {
    const [from, to, weight] = [new Int32Array(size), new Int32Array(size), new Float32Array(size)]
    for (let p = 0; p < size; p++) {
      const f = Math.min(small - 1, Math.max(0, (p - 0.5) / 2))
      from[p] = Math.floor(f)
      to[p] = Math.min(small - 1, from[p] + 1)
      weight[p] = f - from[p]
    }
    return { from, to, weight }
  }
  const [xs, ys] = [near(WIDTH, w), near(HEIGHT, h)]
  const up = (plane: Float32Array, x: number, y: number) => {
    const [tx, ty] = [xs.weight[x], ys.weight[y]]
    const [top, bottom] = [ys.from[y] * w, ys.to[y] * w]
    const above = plane[top + xs.from[x]] * (1 - tx) + plane[top + xs.to[x]] * tx
    const below = plane[bottom + xs.from[x]] * (1 - tx) + plane[bottom + xs.to[x]] * tx
    return above * (1 - ty) + below * ty
  }
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x
      const b = up(smallCb, x, y) - 128
      const r = up(smallCr, x, y) - 128
      red[i] = luma[i] + 1.402 * r
      green[i] = luma[i] - 0.344136 * b - 0.714136 * r
      blue[i] = luma[i] + 1.772 * b
    }
  }
}

/**
 * Draws the trousers. Returns the photo, and which pixels are fabric at least
 * a pixel in from the edge (bar within 40 px of the photo's edge, which tidying
 * the mask trims anyway), and which are backdrop in the top 80 rows of the gap
 * at least 3 px clear of the legs: the sliver that should open.
 */
export function flatLay({
  fabric,
  backdrop = [209, 209, 209],
  crotch = { kind: 'pointed', k: 0.1 },
  turn = 0,
  sheen,
  patch,
  softness = 'jpeg',
}: FlatLay) {
  const gap = gapOf(crotch)
  const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)]
  // Where (x, y) lies before the turn, measured from the point the legs' straight edges meet: across, and down.
  const across = (x: number, y: number) => (x - MID) * cos + (y - CROTCH) * sin
  const down = (x: number, y: number) => (y - CROTCH) * cos - (x - MID) * sin
  const outer = (v: number) =>
    v < HIP - CROTCH
      ? WAIST_HALF + ((HIP_HALF - WAIST_HALF) * (v - WAIST + CROTCH)) / (HIP - WAIST)
      : HIP_HALF + ((HEM_HALF - HIP_HALF) * (v - HIP + CROTCH)) / (LEG - HIP + CROTCH)
  const onTrousers = (x: number, y: number) => {
    const [u, v] = [Math.abs(across(x, y)), down(x, y)]
    return v >= WAIST - CROTCH && v <= LEG && u <= outer(v) && (v < gap.top || u >= gap.half(v))
  }

  // How much of each pixel the trousers cover, from 4 x 4 samples where its corners disagree or the gap may be
  // thinner than a pixel; elsewhere the corners say.
  const total = WIDTH * HEIGHT
  const corners = new Uint8Array((WIDTH + 1) * (HEIGHT + 1))
  for (let y = 0; y <= HEIGHT; y++) for (let x = 0; x <= WIDTH; x++) corners[y * (WIDTH + 1) + x] = onTrousers(x, y) ? 1 : 0
  const cover = new Float32Array(total)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const c = y * (WIDTH + 1) + x
      const corner = corners[c] + corners[c + 1] + corners[c + WIDTH + 1] + corners[c + WIDTH + 2]
      const [u, v] = [across(x + 0.5, y + 0.5), down(x + 0.5, y + 0.5)]
      if ((corner === 0 || corner === 4) && !(Math.abs(u) < 3 && v > gap.top - 3 && v < gap.top + 60)) {
        cover[y * WIDTH + x] = corner / 4
        continue
      }
      let inside = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (onTrousers(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) inside++
      cover[y * WIDTH + x] = inside / 16
    }
  }

  // The cast shadow: the trousers moved down and to the right, and blurred.
  const shadow = new Float32Array(total)
  for (let y = 6; y < HEIGHT; y++) for (let x = 4; x < WIDTH; x++) shadow[y * WIDTH + x] = cover[(y - 6) * WIDTH + x - 4]
  boxBlur(shadow, 7)
  const weave = valueNoise(2, 41)
  const planes = [0, 1, 2].map(() => new Float32Array(total))
  const color = [0, 0, 0]
  const mix = (to: Rgb, amount: number) => {
    const share = Math.min(1, Math.max(0, amount))
    for (let k = 0; k < 3; k++) color[k] += (to[k] - color[k]) * share
  }
  for (let i = 0; i < total; i++) {
    const [px, py] = [(i % WIDTH) + 0.5, Math.floor(i / WIDTH) + 0.5]
    const [u, v] = [across(px, py), down(px, py)]
    // The backdrop, shaded by the cast shadow and, more deeply, round the crotch.
    const lit = (1 - 0.25 * shadow[i]) * (1 - 0.4 * Math.max(0, 1 - Math.hypot(u, v - gap.top) / 120))
    for (let k = 0; k < 3; k++) color[k] = fabric[k]
    if (sheen && cover[i]) {
      const fromGap = v <= gap.top ? Math.hypot(u, v - gap.top) : Math.max(0, Math.abs(u) - Math.max(0, gap.half(v)))
      mix([255, 255, 255], sheen.strength * (1 - fromGap / sheen.width) * Math.min(1, Math.max(0, (230 - v) / 6)))
    }
    if (patch && cover[i]) {
      const out = Math.hypot(u - (patch.dx ?? 0), v - (patch.dy ?? -0.4 * patch.radius)) / patch.radius
      if (out < 1) mix(patch.color, out < 0.45 ? 1 : (1 - out) / 0.55)
    }
    for (let k = 0; k < 3; k++) planes[k][i] = (color[k] + 3 * weave[i]) * cover[i] + backdrop[k] * lit * (1 - cover[i])
  }
  const random = randoms(7)
  for (const plane of planes) gaussian(plane, 0.6)
  for (let i = 0; i < total; i++) {
    const noise = (random() - 0.5) * 6
    for (const plane of planes) plane[i] = Math.round(Math.min(255, Math.max(0, plane[i] + noise)))
  }
  if (softness !== 'none') lossy(planes, softness)
  const data = new Uint8ClampedArray(total * 4)
  for (let i = 0; i < total; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = planes[k][i]
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
      if (clear(x, y, 1, true)) {
        inFabric[y * WIDTH + x] = Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y) >= 40 ? 1 : 0
        continue
      }
      const [u, v] = [across(x + 0.5, y + 0.5), down(x + 0.5, y + 0.5)]
      if (v >= gap.top && v < gap.top + 80 && Math.abs(u) < gap.half(v) && clear(x, y, 3, false)) sliver[y * WIDTH + x] = 1
    }
  }
  const image: RgbaImage = { data, width: WIDTH, height: HEIGHT }
  return { image, inFabric, sliver }
}

const GREY: Rgb = [209, 209, 209]

/**
 * The fabrics tried, each with a patch colour as dark as the shade at the
 * crotch (a faded or worn patch), the tolerances at which the cut-out itself
 * keeps the trousers whole, and the strongest sheen it keeps at each of them.
 * Light grey on grey and khaki on beige lie so near their backdrop that its
 * colour range takes some of the trousers above 40, and any sheen brings a leg's
 * edge into it there too; a stronger sheen than these runs the backdrop down
 * the whole leg. Those are matters for the cut-out, not the crotch.
 */
export const FABRICS: Record<string, { fabric: Rgb; backdrop?: Rgb; patch: Rgb; tolerances: number[]; strongest: number[] }> = {
  black: { fabric: [30, 30, 33], patch: [120, 120, 122], tolerances: [40, 70, 110], strongest: [0.5, 0.5, 0.35] },
  charcoal: { fabric: [70, 70, 72], patch: [120, 120, 122], tolerances: [40, 70, 110], strongest: [0.5, 0.35, 0.25] },
  navy: { fabric: [40, 52, 88], patch: [120, 120, 122], tolerances: [40, 70, 110], strongest: [0.5, 0.35, 0.15] },
  denim: { fabric: [80, 105, 145], patch: [118, 128, 148], tolerances: [40, 70, 110], strongest: [0.5, 0.25, 0] },
  'light grey': { fabric: [160, 160, 163], patch: [124, 124, 126], tolerances: [40], strongest: [0] },
  'khaki on beige': { fabric: [186, 166, 126], backdrop: [228, 215, 192], patch: [140, 132, 116], tolerances: [40], strongest: [0] },
}

/** Sheens down the inside of the legs, and patches over the crotch: above it, centred on it, below it and to one side. */
const DECORATIONS: { label: string; sheen?: FlatLay['sheen']; patch?: Omit<NonNullable<FlatLay['patch']>, 'color'> }[] = [
  { label: 'plain' },
  { label: 'a 15% sheen 30 px wide', sheen: { strength: 0.15, width: 30 } },
  { label: 'a patch of radius 15 above the crotch', patch: { radius: 15 } },
  { label: 'a 35% sheen 10 px wide', sheen: { strength: 0.35, width: 10 } },
  { label: 'a patch of radius 40 centred on the crotch', patch: { radius: 40, dy: 0 } },
  { label: 'a 25% sheen 20 px wide', sheen: { strength: 0.25, width: 20 } },
  { label: 'a patch of radius 70 below the crotch', patch: { radius: 70, dy: 35 } },
  { label: 'a 50% sheen 5 px wide', sheen: { strength: 0.5, width: 5 } },
  { label: 'a patch of radius 40 to one side', patch: { radius: 40, dx: 20, dy: 10 } },
  { label: 'a patch of radius 25 above the crotch', patch: { radius: 25 } },
]

const TURNS = [0, 3, -6, 12, 0, -3, 6, -12]

/** The crotch in words. */
export function crotchName(crotch: Crotch) {
  switch (crotch.kind) {
    case 'pointed':
      return `a pointed crotch, the legs parting ${crotch.k} px a row each`
    case 'rounded':
      return `a crotch rounded to a radius of ${crotch.radius} px`
    case 'flat':
      return `a gap whose top is flat and ${2 * crotch.half} px across`
    case 'curved':
      return `a gap curving open from the crotch, ${crotch.a} px times the square root of the depth each side`
    case 'flared':
      return `a gap flaring open from the crotch`
  }
}

/**
 * Trousers with each of `crotches`, in each fabric, twice over: with each in
 * turn of the sheens and patches that fabric's cut-out keeps, turned by each in
 * turn of 0 to 12 degrees either way, as a JPEG or a WebP. Each comes with the
 * tolerances it's cut out at: those the fabric's cut-out keeps, and its sheen.
 */
export function crotchCases(crotches: Crotch[]) {
  const cases: { label: string; lay: FlatLay; tolerances: number[] }[] = []
  let n = 0
  for (const crotch of crotches) {
    for (const [name, { fabric, backdrop = GREY, patch, tolerances, strongest }] of Object.entries(FABRICS)) {
      const kept = DECORATIONS.filter(({ sheen }) => !sheen || sheen.strength <= Math.max(...strongest))
      for (let twice = 0; twice < 2; twice++, n++) {
        const decoration = kept[n % kept.length]
        const [turn, softness] = [TURNS[n % TURNS.length], n % 2 ? 'webp' : 'jpeg'] as const
        const lay: FlatLay = { fabric, backdrop, crotch, turn, softness, sheen: decoration.sheen }
        if (decoration.patch) lay.patch = { ...decoration.patch, color: patch }
        const label = `${name}, ${crotchName(crotch)}, ${decoration.label}, turned ${turn}°, as a ${softness === 'jpeg' ? 'JPEG' : 'WebP'}`
        cases.push({ label, lay, tolerances: tolerances.filter((_, k) => !decoration.sheen || decoration.sheen.strength <= strongest[k]) })
      }
    }
  }
  return cases
}
