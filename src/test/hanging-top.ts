import type { Rgb, RgbaImage } from '../features/garments/photo-mapping'

/*
 * The front of a top photographed on a hanger, drawn the way it reaches the
 * neck's painting in the analysis: at the app's working size (a front about
 * 455 x 600 with a neck band of 60 rows), anti-aliased, slightly blurred, with
 * sensor noise, and put through a lossy round trip like a JPEG's or a WebP's.
 *
 * The neck opening lies between the back's neckline (a shallow curve near the
 * top) and the front's (a U, a scoop, a square or a V, its lowest point near
 * the bottom of the band). Through it shows the inside of the back in shade,
 * and whatever else is drawn behind the front: a hanger bar with its shaded
 * ends and its hook, a label with a printed word, the back's rib. On the front
 * lie its own things: a rib or collar along the neckline with a shaded inner
 * rim, logos, a top button, a placket, a detail under a label's print.
 * The whole top can be turned a few degrees, set off centre and drawn small.
 */

export type NecklineShape = 'U' | 'scoop' | 'square' | 'V'

/** Things seen through the neck opening, behind the front. */
export type Behind =
  /** A hanger bar across the opening, `thick` rows (at scale 1), its lower edge `above` rows over the neckline's lowest point; its ends darken in two shades where the opening's sides hide them. */
  | { kind: 'bar'; color: Rgb; thick: number; above?: number }
  /** The hanger's hook, from the middle of the bar up out of the top of the front. */
  | { kind: 'hook'; color: Rgb }
  /**
   * A label hanging from the back's neckline, `size` times 40 x 40 (at scale 1),
   * its foot hidden behind the front; or, `over` the bar, as wide as the middle
   * third of it. Its word is printed `printAt` of the way down it, in `print`.
   */
  | { kind: 'label'; color: Rgb; print?: Rgb; size?: number; printAt?: number; over?: 'bar' }
  /** The back's rib, along the top of the opening, with a 1 px highlight along its middle: the front's highlight, and its own (unchecked) rib. */
  | { kind: 'back rib'; color: Rgb; highlight: Rgb }

/** Things on the front, below its neckline. */
export type OnFront =
  /** A logo `width` x `height` (at scale 1) straddling the bottom of the band, `below` of it under the band: beside the opening, or under its lowest point. */
  | { kind: 'logo'; width: number; height: number; below: number; color: Rgb; at: 'side' | 'centre' }
  /** The top button, `size` across (at scale 1), `gap` px under the neckline's lowest point, and more of them lower down. */
  | { kind: 'button'; size: number; gap: number; color: Rgb }
  /** A placket `width` wide (at scale 1), running down from the neckline's lowest point. */
  | { kind: 'placket'; width: number; color: Rgb }
  /** A detail `width` x `height` (at scale 1) just under the neckline, under the label's print or `beside` it. */
  | { kind: 'detail'; width: number; height: number; color: Rgb; beside?: boolean }
  /** A panel `width` wide (at scale 1) down the middle of the front, from its top to its hem. */
  | { kind: 'panel'; width: number; color: Rgb }
  /** Two stripes `width` wide (at scale 1) down the front from its top, `apart` either side of the middle. */
  | { kind: 'stripes'; width: number; apart: number; color: Rgb }

export interface HangingTop {
  color: Rgb
  /** The fabric's weave: plain, a check of `check` squares, or a twill's fine diagonal ribs. */
  weave?: 'plain' | 'check' | 'twill'
  check?: Rgb
  neckline?: NecklineShape
  /** Whether the neck opening shows at all: not on a front folded or laid flat, nor on a plain length of fabric. */
  opening?: boolean
  /** A side of the opening whose inside of the back shows in the front's own colour, so the neckline can't be seen there (black on black). */
  hidden?: 'left' | 'right'
  /** How many rows (at scale 1) the neckline's lowest point lies below the band; negative above it. */
  depth?: number
  /** Half the opening's width at the top (at scale 1). */
  half?: number
  /** The front's rib or collar along the neckline, `width` px (at scale 1), with a shaded inner rim if `rim` is given. */
  rib?: { width: number; color: Rgb; rim?: Rgb }
  /** How much the shade inside the back darkens the fabric. */
  shade?: number
  behind?: Behind[]
  front?: OnFront[]
  softness?: 'none' | 'jpeg' | 'webp'
  /** Degrees the top is turned, about the middle of its neckline's ends. */
  turn?: number
  /** Pixels (at scale 1) the top's centre line lies right of the front's middle. */
  shift?: number
  scale?: number
}

/** A drawn top's front, with where everything in it ended up. */
export interface DrawnTop {
  image: RgbaImage
  /** The neck band's height, as neckBand would give it. */
  band: number
  fabric: Rgb
  /** Each named thing's solid pixels: 1 where it shows, at least three quarters of the pixel. */
  regions: Record<string, Uint8Array>
  /** Which of the regions are seen through the opening (and should be painted over), and which are the front's. */
  behind: string[]
  front: string[]
  /** The drawn neckline: per column, the row the front starts at under the opening; -1 where there's no opening. */
  neckline: Int16Array
  /** The garment's centre line (x), and its tilt (rows per column). */
  axis: number
  tilt: number
}

type Shape = (u: number, y: number) => boolean
interface Layer {
  id: string | null
  shape: Shape
  color: (u: number, y: number) => Rgb
  /** The layer's extent, in the top's own coordinates: [u0, u1] x [y0, y1]. */
  box: [number, number, number, number]
}

const shaded = (color: Rgb, by: number): Rgb => [color[0] * by, color[1] * by, color[2] * by]

/** Separable Gaussian blur of `plane` (`width` x `height`). */
export function gaussian(plane: Float32Array, width: number, height: number, sigma: number) {
  const reach = Math.ceil(sigma * 3)
  const kernel = Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * sigma * sigma)))
  const sum = kernel.reduce((a, b) => a + b)
  const weights = kernel.map((w) => w / sum)
  const across = new Float32Array(plane.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let total = 0
      for (let i = -reach; i <= reach; i++) total += weights[i + reach] * plane[y * width + Math.min(width - 1, Math.max(0, x + i))]
      across[y * width + x] = total
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let total = 0
      for (let i = -reach; i <= reach; i++) total += weights[i + reach] * across[Math.min(height - 1, Math.max(0, y + i)) * width + x]
      plane[y * width + x] = total
    }
  }
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
 * A lossy round trip at quarter-resolution colour, on planes `width` x
 * `height`: a JPEG's 8 x 8 blocks at quality 80, or a WebP's finer 4 x 4 ones.
 */
export function lossy([red, green, blue]: Float32Array[], width: number, height: number, kind: 'jpeg' | 'webp') {
  const total = width * height
  const luma = new Float32Array(total)
  const [cb, cr] = [new Float32Array(total), new Float32Array(total)]
  for (let i = 0; i < total; i++) {
    luma[i] = 0.299 * red[i] + 0.587 * green[i] + 0.114 * blue[i]
    cb[i] = 128 - 0.168736 * red[i] - 0.331264 * green[i] + 0.5 * blue[i]
    cr[i] = 128 + 0.5 * red[i] - 0.418688 * green[i] - 0.081312 * blue[i]
  }
  const [w, h] = [Math.ceil(width / 2), Math.ceil(height / 2)]
  const halve = (plane: Float32Array) => {
    const small = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let [sum, count] = [0, 0]
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            if (2 * y + dy >= height || 2 * x + dx >= width) continue
            sum += plane[(2 * y + dy) * width + 2 * x + dx]
            count++
          }
        }
        small[y * w + x] = sum / count
      }
    }
    return small
  }
  const [smallCb, smallCr] = [halve(cb), halve(cr)]
  const scale = (table: number[]) => table.map((t) => Math.max(1, Math.floor((t * 40 + 50) / 100)))
  if (kind === 'jpeg') {
    quantise(luma, width, height, 8, scale(JPEG_LUMA))
    for (const plane of [smallCb, smallCr]) quantise(plane, w, h, 8, scale([...JPEG_CHROMA, ...new Array<number>(36).fill(99)]))
  } else {
    quantise(luma, width, height, 4, [5, ...new Array<number>(15).fill(7)])
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
  const [xs, ys] = [near(width, w), near(height, h)]
  const up = (plane: Float32Array, x: number, y: number) => {
    const [tx, ty] = [xs.weight[x], ys.weight[y]]
    const [top, bottom] = [ys.from[y] * w, ys.to[y] * w]
    const above = plane[top + xs.from[x]] * (1 - tx) + plane[top + xs.to[x]] * tx
    const below = plane[bottom + xs.from[x]] * (1 - tx) + plane[bottom + xs.to[x]] * tx
    return above * (1 - ty) + below * ty
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const b = up(smallCb, x, y) - 128
      const r = up(smallCr, x, y) - 128
      red[i] = luma[i] + 1.402 * r
      green[i] = luma[i] - 0.344136 * b - 0.714136 * r
      blue[i] = luma[i] + 1.772 * b
    }
  }
}

function randoms(seed: number) {
  let state = seed
  return () => (state = (state * 16807) % 2147483647) / 2147483647
}

/**
 * A drawing (`planes`, one per channel, `width` x `height`) as a photo of it
 * reaches the analysis: a camera's softness and noise, and the lossy round
 * trip of a JPEG or a WebP.
 */
export function photographed(planes: Float32Array[], width: number, height: number, softness: 'none' | 'jpeg' | 'webp') {
  const total = width * height
  const random = randoms(11)
  for (const plane of planes) gaussian(plane, width, height, 0.6)
  for (let i = 0; i < total; i++) {
    const noise = (random() - 0.5) * 6
    for (const plane of planes) plane[i] = Math.round(Math.min(255, Math.max(0, plane[i] + noise)))
  }
  if (softness !== 'none') lossy(planes, width, height, softness)
  const data = new Uint8ClampedArray(total * 4)
  for (let i = 0; i < total; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = planes[k][i]
    data[i * 4 + 3] = 255
  }
  return data
}

/** The front's size and neck band at `scale`, as the analysis gives them for a top photographed at the app's size. */
export function frontSize(scale = 1) {
  const [width, height, band] = [Math.round(455 * scale), Math.round(600 * scale), Math.round(60 * scale)]
  const dip = Math.max(1, Math.round(height * 0.03))
  return { width, height, band, dip }
}

/** Draws the top's front. */
export function hangingTop(top: HangingTop): DrawnTop {
  const {
    color,
    weave = 'plain',
    check = shaded(color, 0.6),
    neckline = 'U',
    opening: open = true,
    hidden,
    depth = 0,
    half = 70,
    rib,
    shade = 0.6,
    behind = [],
    front = [],
    softness = 'jpeg',
    turn = 0,
    shift = 0,
    scale: s = 1,
  } = top
  const { width: W, height: H, band, dip } = frontSize(s)
  const cx = W / 2 + shift * s
  // The neckline's ends sit a little above the shoulders' row, and the back's neckline curves up between them.
  const ends = band - dip - 14 * s
  const bottom = band + depth * s
  const rx = half * s
  const curve = (u: number, reach: number, lowest: number) => {
    const a = Math.min(1, Math.abs(u) / reach)
    const deep = lowest - ends
    switch (neckline) {
      case 'U':
        return ends + deep * Math.sqrt(1 - a * a)
      case 'scoop':
        return ends + deep * Math.cbrt(1 - a * a * a)
      case 'V':
        return lowest - deep * a
      case 'square': {
        const r = 6 * s
        const along = Math.abs(u) - (reach - r)
        return along <= 0 ? lowest : lowest - r + Math.sqrt(Math.max(0, r * r - along * along))
      }
    }
  }
  const front0 = (u: number) => curve(u, rx, bottom)
  const back0 = (u: number) => ends - 10 * s * (1 - Math.min(1, (u / rx) ** 2))
  const opening: Shape = (u, y) => open && Math.abs(u) < rx && y > back0(u) && y < front0(u)
  /** The band `width` px wide along the front's neckline, outside the opening. */
  const alongNeckline = (width: number): Shape => {
    return (u, y) =>
      Math.abs(u) < rx + width && y < curve(u, rx + width, bottom + width) && y >= (Math.abs(u) < rx ? back0(u) : ends) && !opening(u, y)
  }
  const plain = () => color
  const ribWidth = rib ? rib.width * s : 0
  const layers: Layer[] = []
  const add = (id: string | null, shape: Shape, paint: Layer['color'], box: Layer['box']) => layers.push({ id, shape, color: paint, box })
  const fabricAt = (x: number, y: number): Rgb => {
    if (weave === 'check') {
      const period = Math.max(6, Math.round(24 * s))
      const on = (Math.floor(x / (period / 2)) % 2 === 0 ? 0.5 : 0) + (Math.floor(y / (period / 2)) % 2 === 0 ? 0.5 : 0)
      return [0, 1, 2].map((k) => color[k] + (check[k] - color[k]) * on) as Rgb
    }
    if (weave === 'twill') {
      const rise = 14 * Math.sin((2 * Math.PI * (x + y)) / 4)
      return [color[0] + rise, color[1] + rise, color[2] + rise]
    }
    return color
  }
  const insideBox: Layer['box'] = [-rx - 1, rx + 1, ends - 11 * s, bottom + 1]
  // The inside of the back, in shade, filling the opening.
  const unseen = (u: number) => (hidden === 'left' && u < 0) || (hidden === 'right' && u >= 0)
  add('inside', opening, (u, y) => (unseen(u) ? fabricAt(u + cx, y) : shaded(fabricAt(u + cx, y), shade)), insideBox)

  const behindIds: string[] = ['inside']
  const frontIds: string[] = []
  let barBox: Layer['box'] | null = null
  for (const thing of behind) {
    if (thing.kind === 'bar') {
      const lower = bottom - (thing.above ?? 6) * s
      const upper = lower - thing.thick * s
      barBox = [-rx - 10 * s, rx + 10 * s, upper, lower]
      // Where the opening's sides hide it, the bar darkens in two shades.
      const sideAt = (y: number) => {
        let reach = rx
        while (reach > 0 && !opening(reach - 0.5, y)) reach -= 0.5
        return reach
      }
      const sides = new Map<number, number>()
      const paint = (u: number, y: number) => {
        const row = Math.floor(y)
        if (!sides.has(row)) sides.set(row, sideAt(row + 0.5))
        const fromSide = (sides.get(row) ?? rx) - Math.abs(u)
        return shaded(thing.color, fromSide < 6 * s ? 0.55 : fromSide < 13 * s ? 0.78 : 1)
      }
      add('bar', (u, y) => opening(u, y) && y >= upper && y < lower && Math.abs(u) < rx + 10 * s, paint, barBox)
      behindIds.push('bar')
    } else if (thing.kind === 'hook') {
      const foot = barBox ? barBox[2] : ends
      add('hook', (u, y) => Math.abs(u) < 3 * s && y < foot + 1, () => thing.color, [-3 * s, 3 * s, 0, foot + 1])
      behindIds.push('hook')
    } else if (thing.kind === 'label') {
      const size = thing.size ?? 1
      const start = back0(0) + 2 * s
      let [left, right, end] = [-20 * s * size, 20 * s * size, start + 40 * s * size]
      if (thing.over === 'bar' && barBox) {
        // As wide as the middle third of the bar's visible length, and hanging down past it.
        let reach = rx
        while (reach > 0 && !opening(reach - 0.5, barBox[2] + 0.5)) reach -= 0.5
        ;[left, right, end] = [-reach / 3, reach / 3, barBox[3] + 20 * s]
      }
      add('label', (u, y) => opening(u, y) && u >= left && u < right && y >= start && y < end, () => thing.color, [left, right, start, end])
      behindIds.push('label')
      if (thing.print) {
        // A word of five letters, each a stroke box with a gap down its middle.
        const [tall, wide, gap] = [Math.max(2, 6 * s * size), Math.max(1.5, 4 * s * size), Math.max(1, 2 * s * size)]
        const row = start + (end - start) * (thing.printAt ?? 0.55)
        const across = 5 * wide + 4 * gap
        const [from, to] = [-across / 2, across / 2]
        const letter = (u: number) => {
          const k = Math.floor((u - from) / (wide + gap))
          const into = u - from - k * (wide + gap)
          return k >= 0 && k < 5 && into < wide
        }
        const ink = thing.print
        add('print', (u, y) => opening(u, y) && letter(u) && y >= row && y < row + tall, () => ink, [from, to, row, row + tall])
        behindIds.push('print')
      }
    } else {
      // The back's rib, along the top of the opening, with a highlight along its middle.
      const thick = Math.max(2, 6 * s)
      add('back rib', (u, y) => Math.abs(u) < rx && y < back0(u) && y >= back0(u) - thick, () => thing.color, [-rx, rx, ends - 10 * s - thick, ends])
      add('highlight', (u, y) => Math.abs(u) < rx && y < back0(u) - thick / 2 && y >= back0(u) - thick / 2 - 1, () => thing.highlight, [-rx, rx, ends - 10 * s - thick, ends])
      frontIds.push('highlight')
    }
  }
  if (rib) {
    add('rib', alongNeckline(ribWidth), () => rib.color, [-rx - ribWidth - 1, rx + ribWidth + 1, ends - 1, bottom + ribWidth + 1])
    frontIds.push('rib')
    if (rib.rim) {
      const rim = rib.rim
      const thick = Math.max(1, 1.5 * s)
      add('rim', alongNeckline(thick), () => rim, [-rx - thick - 1, rx + thick + 1, ends - 1, bottom + thick + 1])
      frontIds.push('rim')
    }
  }
  const under = bottom + ribWidth
  for (const thing of front) {
    if (thing.kind === 'logo') {
      const [w, h] = [thing.width * s, thing.height * s]
      let y = band - Math.round(h * (1 - thing.below))
      let u = rx + ribWidth + 12 * s + w / 2
      if (thing.at === 'centre') {
        u = 0
        y = Math.max(y, Math.ceil(under + 2 * s))
      }
      add('logo', (pu, py) => Math.abs(pu - u) < w / 2 && py >= y && py < y + h, () => thing.color, [u - w / 2, u + w / 2, y, y + h])
      frontIds.push('logo')
    } else if (thing.kind === 'button') {
      const r = (thing.size * s) / 2
      const y = under + thing.gap + r
      const round = (at: number) => (u: number, py: number) => u * u + (py - at) * (py - at) < r * r
      add('button', round(y), () => thing.color, [-r, r, y - r, y + r])
      for (let lower = 150 * s; lower < H - 20 * s; lower += 110 * s) add(null, round(lower), () => thing.color, [-r, r, lower - r, lower + r])
      frontIds.push('button')
    } else if (thing.kind === 'placket') {
      const w = (thing.width * s) / 2
      add('placket', (u, y) => Math.abs(u) < w && y >= under, () => thing.color, [-w, w, under, H + 40])
      frontIds.push('placket')
    } else if (thing.kind === 'panel') {
      const w = (thing.width * s) / 2
      add('panel', (u) => Math.abs(u) < w, () => thing.color, [-w, w, -40, H + 40])
      frontIds.push('panel')
    } else if (thing.kind === 'stripes') {
      const [w, apart] = [(thing.width * s) / 2, thing.apart * s]
      add('stripes', (u) => Math.abs(Math.abs(u) - apart) < w, () => thing.color, [-apart - w, apart + w, -40, H + 40])
      frontIds.push('stripes')
    } else {
      const [w, h] = [thing.width * s, thing.height * s]
      const u = thing.beside ? 30 * s : 0
      const y = Math.ceil(curve(u, rx + ribWidth, under) + 1)
      add('detail', (pu, py) => Math.abs(pu - u) < w / 2 && py >= y && py < y + h, () => thing.color, [u - w / 2, u + w / 2, y, y + h])
      frontIds.push('detail')
    }
  }

  // Draw: each layer's share of each pixel from 4 x 4 samples, the top turned about the middle of its neckline's ends.
  const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)]
  const total = W * H
  const planes = [0, 1, 2].map(() => new Float32Array(total))
  for (let i = 0; i < total; i++) {
    const c = fabricAt(i % W, Math.floor(i / W))
    for (let k = 0; k < 3; k++) planes[k][i] = c[k]
  }
  const shares: Record<string, Float32Array> = {}
  const openShare = new Float32Array(total)
  const unturn = (x: number, y: number): [number, number] => {
    const [dx, dy] = [x - cx, y - ends]
    return [dx * cos + dy * sin, ends - dx * sin + dy * cos]
  }
  const pixelBox = ([u0, u1, y0, y1]: Layer['box']) => {
    const corners = [
      [u0, y0],
      [u1, y0],
      [u0, y1],
      [u1, y1],
    ].map(([u, y]) => [cx + u * cos - (y - ends) * sin, ends + u * sin + (y - ends) * cos])
    const xs = corners.map(([x]) => x)
    const ys = corners.map(([, y]) => y)
    return [
      Math.max(0, Math.floor(Math.min(...xs)) - 2),
      Math.min(W - 1, Math.ceil(Math.max(...xs)) + 2),
      Math.max(0, Math.floor(Math.min(...ys)) - 2),
      Math.min(H - 1, Math.ceil(Math.max(...ys)) + 2),
    ]
  }
  const sample = (shape: Shape, x: number, y: number, paint: Layer['color']) => {
    let inside = 0
    const sum = [0, 0, 0]
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const [u, gy] = unturn(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)
        if (!shape(u, gy)) continue
        inside++
        const c = paint(u, gy)
        for (let k = 0; k < 3; k++) sum[k] += c[k]
      }
    }
    return { share: inside / 16, color: inside ? (sum.map((v) => v / inside) as Rgb) : null }
  }
  {
    const [x0, x1, y0, y1] = pixelBox(insideBox)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) openShare[y * W + x] = sample(opening, x, y, plain).share
  }
  for (const { id, shape, color: paint, box } of layers) {
    const [x0, x1, y0, y1] = pixelBox(box)
    if (id && !shares[id]) shares[id] = new Float32Array(total)
    const own = id ? shares[id] : null
    const others = Object.entries(shares)
      .filter(([other]) => other !== id)
      .map(([, shown]) => shown)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const { share, color: c } = sample(shape, x, y, paint)
        if (!share || !c) continue
        const i = y * W + x
        for (let k = 0; k < 3; k++) planes[k][i] += (c[k] - planes[k][i]) * share
        for (const shown of others) shown[i] *= 1 - share
        if (own) own[i] += (1 - own[i]) * share
      }
    }
  }
  const data = photographed(planes, W, H, softness)
  const regions: Record<string, Uint8Array> = {}
  for (const [id, shown] of Object.entries(shares)) regions[id] = Uint8Array.from(shown, (v) => (v >= 0.75 ? 1 : 0))
  // The drawn neckline: under each column's lowest pixel that's mostly opening.
  const necklineRows = new Int16Array(W).fill(-1)
  for (let x = 0; x < W; x++) {
    for (let y = Math.min(H - 1, Math.ceil(bottom + 20 * s)); y >= 0; y--) {
      if (openShare[y * W + x] < 0.5) continue
      necklineRows[x] = y + 1
      break
    }
  }
  return {
    image: { data, width: W, height: H },
    band,
    fabric: color,
    regions,
    behind: [...new Set(behindIds)],
    front: [...new Set(frontIds)],
    neckline: necklineRows,
    axis: cx,
    tilt: Math.tan((turn * Math.PI) / 180),
  }
}
