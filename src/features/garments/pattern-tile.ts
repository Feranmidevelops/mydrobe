import { fft2, nextPow2 } from './fft'
import type { Rect, RgbaImage } from './photo-mapping'

/*
 * Seamless tiles for patterned fabric.
 *
 * A check, plaid or stripe repeats on a lattice, and the back and sleeves
 * only look right if their tile holds whole repeats of it. So the lattice is
 * found near the fabric sample from the photo's autocorrelation, its two
 * repeat vectors are sharpened at full resolution, and the repeats seen there
 * are lined up and folded into one straightened cell. That cell tiles with
 * plain repeat wrapping, at the size one repeat had in the photo.
 *
 * Plain fabric, prints and anything else without a lattice it can be sure of
 * get null, so the caller keeps its mirrored sample. Every check along the
 * way fails towards that.
 *
 * Like photo-mapping.ts, it works on plain pixel arrays and needs no canvas.
 */

export type Vec = [number, number]

/** What tiles over the back, sleeves and collar. */
export interface FabricTile {
  pixels: RgbaImage
  /** How many photo pixels one tile spans across and down, which sets its physical scale. */
  width: number
  height: number
  /** 'repeat' for a tile of the fabric's repeat, which wraps seamlessly; 'mirror' for the plain sample. */
  wrap: 'repeat' | 'mirror'
  /** For a repeat tile: where its corner sat in the photo, and the photo vectors its edges span. */
  placement?: { origin: Vec; u: Vec; v: Vec }
  /** For stripes, which repeat one way only rather than as a check or plaid does: how far apart they are, in photo pixels. */
  stripes?: number
}

/**
 * The lattice search's thresholds, tuned on the trial photos (a flannel
 * check, a red plaid and fine blue stripes) and on synthetic garments. Where
 * a margin was measured, the comment gives what those fabrics scored.
 */
export const LATTICE = {
  // Where to look.
  /** Side of the coarse autocorrelation grid, in samples; 80 keeps the transform at 128 x 128. */
  grid: 80,
  /** The large detection window, as a share of the crop's short side, capped in photo pixels. */
  window: 0.9,
  maxWindow: 480,
  /** A small window looked at in full resolution, for repeats too fine for the coarse grid. */
  fineWindow: 80,
  /** The three fallback windows round the sample, as a share of the large one's side. */
  mediumShare: 0.55,
  /** Fine repeats are folded over a window at least this wide, in photo pixels. */
  minFold: 160,
  /**
   * The window must hold this many repeats each way, so the longest repeat
   * found is about 0.9 x the crop's short side / 2.2. A 165 px check passed
   * in a 480 px window.
   */
  minRepeats: 2.2,
  /** Repeats finer than this, in photo pixels or in grid samples, are texture, left to the plain sample. */
  minPeriodPx: 3,
  minPeriodSamples: 3,

  // Reading the autocorrelation.
  /** Lowest autocorrelation a repeat may have. */
  peak: 0.2,
  /** How far the autocorrelation must dip on the way from no shift out to a repeat. */
  dip: 0.2,
  /** The smaller dip allowed along a ridge, for plaids whose bands differ in contrast. */
  ridgeDip: 0.15,
  /** Least dip of a second repeat that only ripples the ridge of a clear first one. */
  weakDip: 0.04,
  /** How much such a lattice's strength is scaled down when ranking candidates. */
  weakRank: 0.7,
  /** Peaks under this share of the strongest don't count as repeats. */
  strongShare: 0.6,
  /** The level outlining the central lobe, which is a long ridge for stripes. */
  lobe: 0.45,
  /** A lobe at least this elongated, reaching this share of the map, is a ridge. */
  ridgeElongation: 4,
  ridgeExtent: 0.2,
  /** The band-pass keeps detail finer than the largest shift looked at over this. */
  bandShare: 2.5,
  /** How far a repeat may lean off the photo's axes, in degrees; bias cuts beyond it fall back. */
  axisSlack: 25,

  // Checking a candidate at full resolution.
  /** How many candidate lattices are checked at full resolution, at most. */
  maxVerify: 3,
  /** Candidates weaker than this aren't checked. The flannel scores 0.315, the red plaid 0.298, the blue stripes 0.714. */
  minVerify: 0.25,
  /** The first search when sharpening a repeat vector, as a share of its length. */
  refineShare: 0.1,
  /**
   * A window at least this similar to itself moved one way, but moved
   * another no more similar than this less 0.3 (so 0.55), may hold stripes
   * read at a slant.
   */
  stripeNcc: 0.85,
  /** Repeats shorter than this many photo pixels are grouped into a larger cell. */
  cellTarget: 48,
  /** Least length of a stripe cell along the stripes, in photo pixels. */
  stripeCell: 16,
  /** Least samples per side of a cell when lining it up. */
  alignGrid: 20,
  /** How far a cell is searched when lining it up: a share of its size, capped in photo pixels. */
  alignShare: 0.08,
  alignMax: 10,
  /** Most cells lined up and folded, nearest the window's centre first. */
  maxCells: 36,
  /** Cells matching the pattern worse than this are left out. */
  minCellNcc: 0.5,
  /**
   * Least share of the window's variation the lattice must explain, judged
   * predicting each cell from the rest. The flannel scores 0.455, the red
   * plaid 0.689, the blue stripes 0.629; 0.1 to 0.15 let washed-out stripes
   * through.
   */
  minFit: 0.3,

  // Making the tile.
  /**
   * The tile is folded from the best this many cells. Three outvote a crease
   * or a button; one is crisper, and showed no defects on 8 photo variants.
   */
  topK: 3,
  /**
   * The folded tile must keep this share of its cells' lightness spread.
   * Good tiles keep 0.805 to 0.994; washed-out folds, such as stripes 3.6 px
   * apart, 0.14 to 0.57.
   */
  minKeep: 0.7,
  /**
   * A tile is soft folds rather than a pattern if its repeat is at least
   * shadingRepeat photo pixels, and over its first shadingHarmonics
   * harmonics each way its chromaticity varies less than shadingChroma and
   * its fundamental holds more than shadingShare of its variation. Even
   * folds 40 to 120 px apart, 0.1 to 0.3 deep, with noise up to 12, score
   * at most 0.0067 and at least 0.991. Checks and stripes in shades of one
   * colour can score as much as 0.96, so for them the chroma matters too; the flannel about 0.011 and 0.74 to 0.89; the
   * red plaid 0.11 to 0.13 and up to 0.974, so its colour alone keeps it.
   */
  shadingChroma: 0.01,
  shadingShare: 0.97,
  shadingRepeat: 24,
  shadingHarmonics: 4,
  /** A sample with less lightness spread than this share of the tile's is plain: the tile came from something else. */
  plainShare: 0.35,
}

const lengthOf = (a: Vec) => Math.hypot(a[0], a[1])
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0]
const scaled = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k]

/** Where a parabola through three evenly spaced samples peaks, as an offset of up to half a step from the middle one. */
function parabolaPeak(before: number, middle: number, after: number) {
  const denom = before - 2 * middle + after
  if (!Number.isFinite(denom) || denom >= 0) return 0
  return Math.max(-0.5, Math.min(0.5, (before - after) / (2 * denom)))
}

/** `value` rounded to three decimal places. The fit and sharpening gates were tuned on values rounded so. */
const toThousandths = (value: number) => Number(value.toFixed(3))

/** LATTICE.axisSlack as the least cosine a direction may make with the nearer photo axis. */
const axisCosine = () => Math.cos((LATTICE.axisSlack * Math.PI) / 180)

/** `w` or its opposite: pointing right if it's nearer the x axis, else pointing down. */
function facingRightOrDown(w: Vec): Vec {
  return Math.abs(w[0]) >= Math.abs(w[1]) ? (w[0] > 0 ? w : scaled(w, -1)) : w[1] > 0 ? w : scaled(w, -1)
}

// Finding candidate lattices on a coarse grid.

/** A window of the photo sampled on a coarse grid. */
interface Grid {
  width: number
  height: number
  /** Red, green and blue at each sample. */
  channels: Float64Array[]
  /** The share of each sample that is garment, from 0 to 1. */
  garment: Float64Array
}

/** Summed-area tables of garment colour over part of the photo, so the mean over any box is four lookups. */
interface ColourSums {
  x: number
  y: number
  width: number
  height: number
  /** Garment pixel counts, then red, green and blue totals, each (width + 1) x (height + 1). */
  count: Float64Array
  red: Float64Array
  green: Float64Array
  blue: Float64Array
}

/** Summed-area tables of the garment's colour over `rect`, clipped to the photo. */
function colourSums(image: RgbaImage, mask: Uint8Array, rect: Rect): ColourSums {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(image.width, rect.x + rect.width)
  const y1 = Math.min(image.height, rect.y + rect.height)
  const W = x1 - x0
  const H = y1 - y0
  const stride = W + 1
  const count = new Float64Array(stride * (H + 1))
  const red = new Float64Array(stride * (H + 1))
  const green = new Float64Array(stride * (H + 1))
  const blue = new Float64Array(stride * (H + 1))
  const { data, width } = image
  for (let y = 0; y < H; y++) {
    let rowCount = 0
    let rowRed = 0
    let rowGreen = 0
    let rowBlue = 0
    const row = (y + 1) * stride
    const above = y * stride
    for (let x = 0; x < W; x++) {
      const i = (y0 + y) * width + x0 + x
      if (mask[i]) {
        rowCount++
        rowRed += data[i * 4]
        rowGreen += data[i * 4 + 1]
        rowBlue += data[i * 4 + 2]
      }
      count[row + x + 1] = count[above + x + 1] + rowCount
      red[row + x + 1] = red[above + x + 1] + rowRed
      green[row + x + 1] = green[above + x + 1] + rowGreen
      blue[row + x + 1] = blue[above + x + 1] + rowBlue
    }
  }
  return { x: x0, y: y0, width: W, height: H, count, red, green, blue }
}

/** The window's garment colours with a sample every `scale` photo pixels, using `sums` where they cover it. */
function gridOf(image: RgbaImage, mask: Uint8Array, win: Rect, scale: number, sums: ColourSums): Grid {
  return scale > 1 ? smoothGrid(image, mask, win, scale, sums) : pixelGrid(image, mask, win)
}

/** The window at full resolution: one sample per photo pixel. */
function pixelGrid(image: RgbaImage, mask: Uint8Array, win: Rect): Grid {
  const { width: w, height: h } = win
  const channels = [new Float64Array(w * h), new Float64Array(w * h), new Float64Array(w * h)]
  const garment = new Float64Array(w * h)
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const i = (win.y + gy) * image.width + win.x + gx
      if (!mask[i]) continue
      const k = gy * w + gx
      channels[0][k] = image.data[i * 4]
      channels[1][k] = image.data[i * 4 + 1]
      channels[2][k] = image.data[i * 4 + 2]
      garment[k] = 1
    }
  }
  return { width: w, height: h, channels, garment }
}

/**
 * The window with a sample every `scale` photo pixels, each averaging the
 * garment in a box twice the step, so repeats finer than the grid fade
 * instead of aliasing into a false, coarser lattice.
 */
function smoothGrid(image: RgbaImage, mask: Uint8Array, win: Rect, scale: number, sums: ColourSums): Grid {
  const w = Math.floor(win.width / scale)
  const h = Math.floor(win.height / scale)
  const need = { x: win.x - scale, y: win.y - scale, width: w * scale + 2 * scale, height: h * scale + 2 * scale }
  const covered =
    sums.x <= Math.max(0, need.x) &&
    sums.y <= Math.max(0, need.y) &&
    sums.x + sums.width >= Math.min(image.width, need.x + need.width) &&
    sums.y + sums.height >= Math.min(image.height, need.y + need.height)
  const { x: x0, y: y0, width: W, height: H, count, red, green, blue } = covered ? sums : colourSums(image, mask, need)
  const stride = W + 1
  const channels = [new Float64Array(w * h), new Float64Array(w * h), new Float64Array(w * h)]
  const garment = new Float64Array(w * h)
  for (let gy = 0; gy < h; gy++) {
    const cy = win.y + gy * scale + scale / 2 - y0
    const ya = Math.max(0, Math.round(cy - scale)) * stride
    const yb = Math.min(H, Math.round(cy + scale)) * stride
    for (let gx = 0; gx < w; gx++) {
      const cx = win.x + gx * scale + scale / 2 - x0
      const xa = Math.max(0, Math.round(cx - scale))
      const xb = Math.min(W, Math.round(cx + scale))
      const n = count[yb + xb] - count[ya + xb] - count[yb + xa] + count[ya + xa]
      const k = gy * w + gx
      const area = ((yb - ya) / stride) * (xb - xa)
      garment[k] = area > 0 ? n / area : 0
      if (n < 1) continue
      channels[0][k] = (red[yb + xb] - red[ya + xb] - red[yb + xa] + red[ya + xa]) / n
      channels[1][k] = (green[yb + xb] - green[ya + xb] - green[yb + xa] + green[ya + xa]) / n
      channels[2][k] = (blue[yb + xb] - blue[ya + xb] - blue[yb + xa] + blue[ya + xa]) / n
    }
  }
  return { width: w, height: h, channels, garment }
}

/** Box blur of radius `r` along rows then columns, `passes` times; three passes come close to a Gaussian. */
function boxBlur(values: Float64Array, w: number, h: number, r: number, passes: number): Float64Array {
  const a = Float64Array.from(values)
  const b = new Float64Array(w * h)
  const line = new Float64Array(Math.max(w, h) + 1)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w
      for (let x = 0; x < w; x++) line[x + 1] = line[x] + a[o + x]
      for (let x = 0; x < w; x++) {
        const lo = x - r < 0 ? 0 : x - r
        const hi = x + r + 1 > w ? w : x + r + 1
        b[o + x] = (line[hi] - line[lo]) / (hi - lo)
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) line[y + 1] = line[y] + b[y * w + x]
      for (let y = 0; y < h; y++) {
        const lo = y - r < 0 ? 0 : y - r
        const hi = y + r + 1 > h ? h : y + r + 1
        a[y * w + x] = (line[hi] - line[lo]) / (hi - lo)
      }
    }
  }
  return a
}

/**
 * Blur of `values` over the garment only: the blur of values times
 * `garment`, divided by the blur of `garment` (passed as `garmentBlur` when
 * it's already known).
 */
function blurMasked(
  values: Float64Array,
  garment: Float64Array,
  w: number,
  h: number,
  r: number,
  passes = 3,
  garmentBlur?: Float64Array,
) {
  const weighted = new Float64Array(w * h)
  for (let k = 0; k < w * h; k++) weighted[k] = values[k] * garment[k]
  const out = boxBlur(weighted, w, h, r, passes)
  const share = garmentBlur ?? boxBlur(garment, w, h, r, passes)
  for (let k = 0; k < w * h; k++) out[k] = share[k] > 1e-6 ? out[k] / share[k] : 0
  return out
}

/**
 * Keeps the pattern and drops the rest: takes off the local mean (folds,
 * shading) and divides by the local contrast, so a hand or a shadowed fold
 * doesn't outweigh the fabric around it.
 */
function bandPass(grid: Grid, r: number) {
  const { width: w, height: h, channels, garment } = grid
  const garmentBlur = boxBlur(garment, w, h, r, 3)
  for (const c of channels) {
    const low = blurMasked(c, garment, w, h, r, 3, garmentBlur)
    for (let k = 0; k < w * h; k++) c[k] = garment[k] ? c[k] - low[k] : 0
  }
  const energy = new Float64Array(w * h)
  for (let k = 0; k < w * h; k++) energy[k] = channels[0][k] ** 2 + channels[1][k] ** 2 + channels[2][k] ** 2
  const local = blurMasked(energy, garment, w, h, r, 3, garmentBlur)
  let mean = 0
  let n = 0
  for (let k = 0; k < w * h; k++) {
    if (!garment[k]) continue
    mean += local[k]
    n++
  }
  const floor = 0.05 * (mean / Math.max(1, n)) + 1
  for (const c of channels) for (let k = 0; k < w * h; k++) c[k] /= Math.sqrt(local[k] + floor)
}

/**
 * Normalised autocorrelation of the three colour channels, allowing for the
 * mask: each shift's sum is divided by how much garment overlaps at it.
 * Returns a (2L + 1)^2 map of shifts -L..L, NaN where under 30% overlaps.
 */
function autocorrelation(grid: Grid, L: number): Float32Array {
  const { width: w, height: h, channels, garment } = grid
  const nw = nextPow2(w + L)
  const nh = nextPow2(h + L)
  const size = nw * nh
  const aRe = new Float64Array(size)
  const aIm = new Float64Array(size)
  const bRe = new Float64Array(size)
  const bIm = new Float64Array(size)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const K = y * nw + x
      aRe[K] = channels[0][k] * garment[k]
      aIm[K] = channels[1][k] * garment[k]
      bRe[K] = channels[2][k] * garment[k]
      bIm[K] = garment[k]
    }
  }
  // Two real signals per complex transform: (red, green) and (blue, garment).
  fft2(aRe, aIm, nw, nh, false, h)
  fft2(bRe, bIm, nw, nh, false, h)
  const cRe = new Float64Array(size)
  const cIm = new Float64Array(size)
  for (let ky = 0; ky < nh; ky++) {
    for (let kx = 0; kx < nw; kx++) {
      const K = ky * nw + kx
      const N = ((nh - ky) % nh) * nw + ((nw - kx) % nw)
      const pa = (aRe[K] * aRe[K] + aIm[K] * aIm[K] + aRe[N] * aRe[N] + aIm[N] * aIm[N]) / 2
      const c2r = (bRe[K] + bRe[N]) / 2
      const c2i = (bIm[K] - bIm[N]) / 2
      const mr = (bIm[K] + bIm[N]) / 2
      const mi = (bRe[N] - bRe[K]) / 2
      cRe[K] = pa + c2r * c2r + c2i * c2i
      cIm[K] = mr * mr + mi * mi
    }
  }
  // Both power spectra are real and even, so one inverse gives both autocorrelations.
  fft2(cRe, cIm, nw, nh, true)
  const side = 2 * L + 1
  const r = new Float32Array(side * side)
  const overlap0 = cIm[0]
  const variance = cRe[0] / Math.max(1e-9, overlap0)
  for (let dy = -L; dy <= L; dy++) {
    for (let dx = -L; dx <= L; dx++) {
      const K = ((dy + nh) % nh) * nw + ((dx + nw) % nw)
      const overlap = cIm[K]
      r[(dy + L) * side + dx + L] = overlap > 0.3 * overlap0 && variance > 1e-6 ? cRe[K] / (overlap * variance) : NaN
    }
  }
  return r
}

/** A candidate lattice, in grid samples while it's being found and in photo pixels after. */
interface Found {
  kind: 'grid' | 'stripes'
  /** The repeat vectors; a grid's are the straightened tile's edges, near the x and y axes. */
  u: Vec
  v: Vec
  /** The autocorrelation at its repeats, for ranking candidates. */
  strength: number
  /** For stripes, which vector is the repeat across them; the other is a unit vector along them. */
  across?: 'u' | 'v'
}

/**
 * The tile edges for a lattice with base vectors A and B: its shortest
 * vectors within LATTICE.axisSlack of the photo's x and y axes, pointing
 * right and down. Null if there are none, or the cell they make holds more
 * than about four base cells.
 */
function axisAlignedCell(A: Vec, B: Vec): { u: Vec; v: Vec } | null {
  const slack = Math.tan((LATTICE.axisSlack * Math.PI) / 180)
  let u: Vec | null = null
  let v: Vec | null = null
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (!i && !j) continue
      const w: Vec = [i * A[0] + j * B[0], i * A[1] + j * B[1]]
      const l = lengthOf(w)
      if (Math.abs(w[1]) <= slack * Math.abs(w[0]) && (!u || l < lengthOf(u) - 1e-6)) u = w[0] > 0 ? w : [-w[0], -w[1]]
      if (Math.abs(w[0]) <= slack * Math.abs(w[1]) && (!v || l < lengthOf(v) - 1e-6)) v = w[1] > 0 ? w : [-w[0], -w[1]]
    }
  }
  if (!u || !v) return null
  if (Math.abs(cross(u, v)) > 4.5 * Math.abs(cross(A, B))) return null
  return { u, v }
}

/** Reads an autocorrelation map of shifts -L..L: `at` a whole shift (NaN off the map), `between` interpolating bilinearly. */
function mapReader(r: Float32Array, L: number) {
  const side = 2 * L + 1
  const at = (x: number, y: number) => (x < -L || x > L || y < -L || y > L ? NaN : r[(y + L) * side + x + L])
  const between = (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    return (
      (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) +
      (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    )
  }
  return { at, between }
}

const NEIGHBOURS: Vec[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * The central lobe of an autocorrelation map: the shifts round no shift
 * where it stays at or above LATTICE.lobe. It's compact for a check or plain
 * cloth and a long ridge for stripes; `ridge` is the direction it's longest in.
 */
function centralLobe(r: Float32Array, L: number): { ridged: boolean; ridge: Vec } {
  const side = 2 * L + 1
  const seen = new Uint8Array(side * side)
  const queue = [L * side + L]
  seen[L * side + L] = 1
  let sxx = 0
  let syy = 0
  let sxy = 0
  let extent = 0
  while (queue.length) {
    const k = queue.pop() as number
    const x = (k % side) - L
    const y = Math.floor(k / side) - L
    sxx += x * x
    syy += y * y
    sxy += x * y
    extent = Math.max(extent, Math.hypot(x, y))
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < -L || nx > L || ny < -L || ny > L) continue
      const nk = (ny + L) * side + nx + L
      if (seen[nk] || !(r[nk] >= LATTICE.lobe)) continue
      seen[nk] = 1
      queue.push(nk)
    }
  }
  const half = (sxx + syy) / 2
  const spread = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy)
  const big = half + spread
  const small = Math.max(1e-6, half - spread)
  const elongation = Math.sqrt(big / small)
  const axis: Vec = Math.abs(sxy) > 1e-9 ? [sxy, big - sxx] : sxx >= syy ? [1, 0] : [0, 1]
  return {
    ridged: elongation >= LATTICE.ridgeElongation && extent >= LATTICE.ridgeExtent * L,
    ridge: scaled(axis, 1 / lengthOf(axis)),
  }
}

/**
 * Stripes with bands `spacing` apart across `normal`. Of u and v, one is the
 * repeat across them and the other a unit vector along them, in whichever
 * order keeps u nearer the x axis, both pointing right or down.
 */
function stripesAcross(normal: Vec, spacing: number, strength: number): Found {
  const n = facingRightOrDown(normal)
  const along: Vec = [-n[1], n[0]]
  return Math.abs(n[0]) >= Math.abs(n[1])
    ? { kind: 'stripes', u: scaled(n, spacing), v: along[1] > 0 ? along : scaled(along, -1), strength, across: 'u' }
    : { kind: 'stripes', u: along[0] > 0 ? along : scaled(along, -1), v: scaled(n, spacing), strength, across: 'v' }
}

/**
 * Finds lattices in an autocorrelation map, in grid samples: a grid from its
 * two shortest clear repeats, and stripes from a ridge through no shift with
 * a repeat across it. `hasClearPeak` says whether any repeat stood out at
 * all, which makes a plaid's bands worth a look one way at a time.
 */
function findLattice(r: Float32Array, L: number, minLag: number): { lattices: Found[]; hasClearPeak: boolean } {
  const lattices: Found[] = []
  const { at, between } = mapReader(r, L)
  /** The lowest value on the way from no shift out to (x, y). */
  const lowestTo = (x: number, y: number) => {
    const n = Math.ceil(Math.hypot(x, y) * 2)
    let lowest = Infinity
    for (let k = 1; k < n; k++) {
      const value = between((x * k) / n, (y * k) / n)
      if (value < lowest) lowest = value
    }
    return lowest
  }
  /** How far the map dips below its value at `w` on the way out to it. */
  const dipTo = (w: Vec) => between(w[0], w[1]) - lowestTo(w[0], w[1])

  const { ridged, ridge } = centralLobe(r, L)
  const alongRidge = (w: Vec) => ridged && Math.abs(w[0] * ridge[0] + w[1] * ridge[1]) / lengthOf(w) > Math.cos(Math.PI / 12)
  const dipNeeded = (w: Vec) => (alongRidge(w) ? LATTICE.ridgeDip : LATTICE.dip)

  // Peaks of the map in one half-plane (it's symmetric), strongest first.
  const maxima: { x: number; y: number; value: number }[] = []
  for (let y = 0; y <= L; y++) {
    for (let x = -L; x <= L; x++) {
      if (y === 0 && x <= 0) continue
      if (x * x + y * y < minLag * minLag) continue
      const value = at(x, y)
      if (!(value >= LATTICE.peak)) continue
      let top = true
      for (let dy = -1; dy <= 1 && top; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && at(x + dx, y + dy) > value) {
            top = false
            break
          }
        }
      }
      if (top) maxima.push({ x, y, value })
    }
  }
  maxima.sort((a, b) => b.value - a.value)
  // The repeats among them, placed between samples: peaks the map dips well below on the way out.
  const peaks: { p: Vec; value: number; length: number }[] = []
  let clear = 0
  for (const { x, y, value } of maxima.slice(0, 32)) {
    const p: Vec = [x + parabolaPeak(at(x - 1, y), value, at(x + 1, y)), y + parabolaPeak(at(x, y - 1), value, at(x, y + 1))]
    const dip = value - lowestTo(p[0], p[1])
    if (value >= 0.3 && dip >= LATTICE.dip) clear++
    if (!(dip >= dipNeeded(p))) continue
    if (peaks.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 1.5)) continue
    peaks.push({ p, value, length: lengthOf(p) })
  }
  const hasClearPeak = clear > 0

  let clearRipple = false
  if (peaks.length) {
    const best = Math.max(...peaks.map((q) => q.value))
    const strong = peaks
      .filter((q) => q.value >= Math.max(LATTICE.peak, LATTICE.strongShare * best))
      .sort((q1, q2) => q1.length - q2.length)
    const a = strong[0]
    const b = [...peaks]
      .sort((q1, q2) => q1.length - q2.length)
      .find((q) => Math.abs(cross(a.p, q.p)) / (a.length * q.length) >= 0.5)
    if (b) {
      // Lagrange-Gauss reduction to the two shortest independent vectors.
      let A: Vec = [...a.p]
      let B: Vec = [...b.p]
      for (let guard = 0; guard < 20; guard++) {
        if (lengthOf(B) < lengthOf(A)) [A, B] = [B, A]
        const k = Math.round((A[0] * B[0] + A[1] * B[1]) / (lengthOf(A) ** 2))
        if (!k) break
        B = [B[0] - k * A[0], B[1] - k * A[1]]
      }
      const strength = Math.min(between(A[0], A[1]), between(B[0], B[1]))
      const dipsOk = dipTo(A) >= dipNeeded(A) && dipTo(B) >= dipNeeded(B)
      const cell = axisAlignedCell(A, B)
      const longEnough = lengthOf(A) >= minLag && lengthOf(B) >= minLag
      // On a ridge, a grid needs a real repeat along it too; stripes have none.
      let modulated = !ridged
      let ripple = 0
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          const w: Vec = [i * A[0] + j * B[0], i * A[1] + j * B[1]]
          if ((!i && !j) || lengthOf(w) > L || !alongRidge(w)) continue
          if (!(between(w[0], w[1]) >= LATTICE.peak)) continue
          ripple = Math.max(ripple, dipTo(w))
          if (ripple >= LATTICE.ridgeDip) modulated = true
        }
      }
      clearRipple = ripple >= LATTICE.dip
      if (strength >= LATTICE.peak && dipsOk && cell && modulated && longEnough) {
        lattices.push({ kind: 'grid', u: cell.u, v: cell.v, strength })
      } else if (
        strength >= LATTICE.peak &&
        cell &&
        longEnough &&
        Math.max(dipTo(A), dipTo(B)) >= LATTICE.dip &&
        Math.min(dipTo(A), dipTo(B)) >= LATTICE.weakDip
      ) {
        // One repeat is clear and the other only ripples a ridge, as when a
        // plaid's bands one way are far bolder: worth checking, ranked lower.
        lattices.push({ kind: 'grid', u: cell.u, v: cell.v, strength: strength * LATTICE.weakRank })
      }
    }
  }

  if (!ridged) return { lattices, hasClearPeak }
  // Stripes: the repeat across the ridge, averaged over a few shifts along it.
  const normal: Vec = [-ridge[1], ridge[0]]
  const across = (t: number) => {
    let sum = 0
    let n = 0
    for (let s = -3; s <= 3; s++) {
      const value = between(t * normal[0] + s * ridge[0], t * normal[1] + s * ridge[1])
      if (Number.isFinite(value)) {
        sum += value
        n++
      }
    }
    return n ? sum / n : NaN
  }
  let lowest = Infinity
  let period = 0
  let strength = 0
  for (let t = 1; t < L - 1; t += 0.5) {
    const value = across(t)
    if (value < lowest) lowest = value
    if (t < minLag || !(value >= LATTICE.peak)) continue
    if (value - lowest < LATTICE.dip) continue
    const before = across(t - 0.5)
    const after = across(t + 0.5)
    if (value >= before && value >= after) {
      period = t + 0.5 * parabolaPeak(before, value, after)
      strength = value
      break
    }
  }
  if (!period) return { lattices, hasClearPeak }
  if (Math.max(Math.abs(normal[0]), Math.abs(normal[1])) < axisCosine()) return { lattices, hasClearPeak }
  const stripes = stripesAcross(normal, period, strength)
  // A grid read off a ridge is only trusted first if it clearly ripples along it.
  if (clearRipple) lattices.push(stripes)
  else {
    for (const lattice of lattices) lattice.strength *= 0.9
    lattices.unshift(stripes)
  }
  return { lattices, hasClearPeak }
}

/**
 * The bands across one axis in an autocorrelation map of what varies along
 * it. The band normal is searched within the axis slack, and the profile
 * across the bands is averaged along a long stretch of them, so bands that
 * wander a little on a draped garment still show their repeat.
 */
function bandsAcross(r: Float32Array, L: number, minLag: number, axis: 'x' | 'y') {
  const { between } = mapReader(r, L)
  const reach = Math.max(3, Math.round(L * 0.4))
  let best: { normal: Vec; period: number; strength: number } | null = null
  for (let deg = -LATTICE.axisSlack; deg <= LATTICE.axisSlack + 1e-9; deg += 2.5) {
    const a = (deg * Math.PI) / 180
    const normal: Vec = axis === 'x' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)]
    const ridge: Vec = [-normal[1], normal[0]]
    const profile = (t: number) => {
      let sum = 0
      let n = 0
      for (let s = -reach; s <= reach; s += 2) {
        const value = between(t * normal[0] + s * ridge[0], t * normal[1] + s * ridge[1])
        if (Number.isFinite(value)) {
          sum += value
          n++
        }
      }
      return n >= 3 ? sum / n : NaN
    }
    let lowest = Infinity
    for (let t = 1; t < L - 1; t += 0.5) {
      const value = profile(t)
      if (value < lowest) lowest = value
      if (t < minLag || !(value >= LATTICE.peak) || value - lowest < LATTICE.dip) continue
      const before = profile(t - 0.5)
      const after = profile(t + 0.5)
      if (value >= before && value >= after) {
        if (!best || value > best.strength) best = { normal, period: t + 0.5 * parabolaPeak(before, value, after), strength: value }
        break
      }
    }
  }
  return best
}

/** A copy of the grid with what's constant along x (or y) over a stretch of `r` samples taken off, leaving the bands across it. */
function highPassAlong(grid: Grid, horizontal: boolean, r: number): Grid {
  const { width: w, height: h, garment } = grid
  const channels = grid.channels.map((c) => Float64Array.from(c))
  const n = horizontal ? w : h
  const lines = horizontal ? h : w
  const at = (l: number, t: number) => (horizontal ? l * w + t : t * w + l)
  const weighted = new Float64Array(n + 1)
  const share = new Float64Array(n + 1)
  const mean = new Float64Array(n)
  for (const c of channels) {
    for (let l = 0; l < lines; l++) {
      for (let t = 0; t < n; t++) {
        const k = at(l, t)
        weighted[t + 1] = weighted[t] + c[k] * garment[k]
        share[t + 1] = share[t] + garment[k]
      }
      for (let t = 0; t < n; t++) {
        const a = Math.max(0, t - r)
        const b = Math.min(n, t + r + 1)
        const d = share[b] - share[a]
        mean[t] = d > 1e-6 ? (weighted[b] - weighted[a]) / d : 0
      }
      for (let t = 0; t < n; t++) {
        const k = at(l, t)
        c[k] = garment[k] ? c[k] - mean[t] : 0
      }
    }
  }
  return { width: w, height: h, channels, garment }
}

/**
 * A plaid whose bands one way are much bolder than the other hides the
 * fainter repeat in the full map, so each direction's bands are looked at
 * alone. Taking off what's constant along x leaves the bands that vary along
 * it, and likewise for y. One repeat across the first family keeps to the
 * same band of the second, and the other way round.
 */
function plaidFromBands(grid: Grid, L: number, minLag: number): Found | null {
  const reach = Math.max(2, Math.round(L / 2))
  const acrossX = bandsAcross(autocorrelation(highPassAlong(grid, true, reach), L), L, minLag, 'x')
  const acrossY = bandsAcross(autocorrelation(highPassAlong(grid, false, reach), L), L, minLag, 'y')
  const slack = axisCosine()
  if (!(acrossX && acrossY && Math.abs(acrossX.normal[0]) >= slack && Math.abs(acrossY.normal[1]) >= slack)) return null
  const n1: Vec = acrossX.normal[0] > 0 ? acrossX.normal : scaled(acrossX.normal, -1)
  const n2: Vec = acrossY.normal[1] > 0 ? acrossY.normal : scaled(acrossY.normal, -1)
  const det = n1[0] * n2[1] - n1[1] * n2[0]
  return {
    kind: 'grid',
    u: [(acrossX.period * n2[1]) / det, (-acrossX.period * n2[0]) / det],
    v: [(-acrossY.period * n1[1]) / det, (acrossY.period * n1[0]) / det],
    strength: Math.min(acrossX.strength, acrossY.strength),
  }
}

/** A square of side `side` centred near (cx, cy), kept inside `crop`. */
function squareIn(crop: Rect, cx: number, cy: number, side: number): Rect {
  const s = Math.max(8, Math.min(side, crop.width, crop.height))
  const x = Math.round(Math.min(Math.max(cx - s / 2, crop.x), crop.x + crop.width - s))
  const y = Math.round(Math.min(Math.max(cy - s / 2, crop.y), crop.y + crop.height - s))
  return { x, y, width: Math.floor(s), height: Math.floor(s) }
}

/**
 * Candidate lattices in one window, found on a grid with a sample every
 * `scale` photo pixels and returned in photo pixels. Candidates whose repeat
 * doesn't fit LATTICE.minRepeats times into the window are dropped.
 */
function detect(image: RgbaImage, mask: Uint8Array, win: Rect, scale: number, sums: ColourSums): Found[] {
  const grid = gridOf(image, mask, win, scale, sums)
  let cover = 0
  for (let i = 0; i < grid.garment.length; i++) cover += grid.garment[i]
  if (cover < 0.5 * grid.width * grid.height) return []
  const L = Math.floor(Math.min(grid.width, grid.height) * 0.6)
  bandPass(grid, Math.max(2, Math.round(L / LATTICE.bandShare)))
  const minLag = Math.max(LATTICE.minPeriodSamples, LATTICE.minPeriodPx / scale)
  const { lattices, hasClearPeak } = findLattice(autocorrelation(grid, L), L, minLag)
  if (!lattices.length && hasClearPeak) {
    const plaid = plaidFromBands(grid, L, minLag)
    if (plaid) lattices.push(plaid)
  }
  const side = Math.min(win.width, win.height)
  const inPhoto: Found[] = []
  for (const found of lattices) {
    const u = scaled(found.u, scale)
    const v = scaled(found.v, scale)
    const longest = found.kind === 'grid' ? Math.max(lengthOf(u), lengthOf(v)) : lengthOf(found.across === 'u' ? u : v)
    if (longest > side / LATTICE.minRepeats) continue
    inPhoto.push({ ...found, u, v })
  }
  return inPhoto
}

/** A candidate lattice, with the window it was found in and the grid's step there. */
interface Candidate {
  found: Found
  win: Rect
  scale: number
}

/** How coarse a lattice is: a grid's cell area, or the spacing of stripes. */
function coarseness(found: Found) {
  return found.kind === 'grid' ? Math.abs(cross(found.u, found.v)) : lengthOf(found.across === 'u' ? found.u : found.v)
}

/** Whether lattice `big` is made of whole steps of the finer lattice `small`. */
function isMadeOf(big: Found, small: Found) {
  if (big.kind !== small.kind) return false
  const near = (x: number) => Math.abs(x - Math.round(x)) < 0.15
  if (big.kind === 'stripes') {
    const a = big.across === 'u' ? big.u : big.v
    const b = small.across === 'u' ? small.u : small.v
    const cos = Math.abs(a[0] * b[0] + a[1] * b[1]) / (lengthOf(a) * lengthOf(b))
    const ratio = lengthOf(a) / lengthOf(b)
    return big.across === small.across && cos > Math.cos((5 * Math.PI) / 180) && near(ratio) && Math.round(ratio) !== 0
  }
  const d = cross(small.u, small.v)
  const steps = (w: Vec): Vec => [cross(w, small.v) / d, cross(small.u, w) / d]
  const [a1, b1] = steps(big.u)
  const [a2, b2] = steps(big.v)
  return (
    near(a1) &&
    near(b1) &&
    near(a2) &&
    near(b2) &&
    Math.abs(Math.round(a1) * Math.round(b2) - Math.round(b1) * Math.round(a2)) >= 1
  )
}

/**
 * Candidates strongest first, except that a lattice made of whole steps of a
 * finer one found nearby gives way to it: that's the same pattern seen as a
 * block of repeats, or an alias of it.
 */
function inTryingOrder(list: Candidate[]): Candidate[] {
  const order = [...list].sort((a, b) => b.found.strength - a.found.strength)
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false
    for (let i = 0; i < order.length && !moved; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const big = order[i].found
        const small = order[j].found
        if (coarseness(small) < 0.8 * coarseness(big) && small.strength >= 0.5 * big.strength && isMadeOf(big, small)) {
          order.splice(i, 0, order.splice(j, 1)[0])
          moved = true
          break
        }
      }
    }
    if (!moved) break
  }
  return order
}

/** The photo and the main pipeline's choices for it, as latticeTile was given them. */
interface Source {
  image: RgbaImage
  solid: Uint8Array
  crop: Rect
  swatch: Rect
}

/**
 * A seamless tile of the fabric's repeating pattern around the sample, or
 * null when the fabric has no repeat to find (plain cloth, prints) or it
 * can't be found with confidence. `solid` is the garment mask with its soft
 * edge eroded, and `crop` and `swatch` are the front crop and plain sample
 * the main pipeline chose.
 *
 * Every window looked in holds the sample's centre, which chooseSwatch keeps
 * clear of prints and pockets: first a large one for big repeats and a small
 * one at full resolution for fine ones, then, only if neither gives a tile,
 * three medium ones shifted towards the crop's middle, which see less drift
 * on a draped garment.
 */
export function latticeTile(image: RgbaImage, solid: Uint8Array, crop: Rect, swatch: Rect): FabricTile | null {
  const source: Source = { image, solid, crop, swatch }
  const cx = swatch.x + swatch.width / 2
  const cy = swatch.y + swatch.height / 2
  // Colour sums over the crop and a margin, shared by every coarse grid.
  const sums = colourSums(image, solid, { x: crop.x - 16, y: crop.y - 16, width: crop.width + 32, height: crop.height + 32 })
  const side = Math.min(Math.round(Math.min(crop.width, crop.height) * LATTICE.window), LATTICE.maxWindow)
  const candidates: Candidate[] = []
  const looked = new Set<string>()
  const lookIn = (win: Rect) => {
    const key = `${win.x},${win.y},${win.width}`
    if (looked.has(key)) return
    looked.add(key)
    const scale = Math.max(1, Math.ceil(win.width / LATTICE.grid))
    for (const found of detect(image, solid, win, scale, sums)) candidates.push({ found, win, scale })
  }
  // At most LATTICE.maxVerify candidates are checked over both rounds.
  let checked = 0
  const firstTile = (list: Candidate[]) => {
    for (const candidate of inTryingOrder(list)) {
      if (checked >= LATTICE.maxVerify) return null
      if (candidate.found.strength < LATTICE.minVerify) continue
      checked++
      const tile = verify(source, candidate.found, candidate.win, candidate.scale)
      if (tile) return tile
    }
    return null
  }

  lookIn(squareIn(crop, cx, cy, side))
  lookIn(squareIn(crop, cx, cy, LATTICE.fineWindow))
  const tile = firstTile(candidates)
  if (tile) return tile
  const before = candidates.length
  const medium = Math.round(side * LATTICE.mediumShare)
  const inward = cx < crop.x + crop.width / 2 ? 1 : -1
  for (const [ox, oy] of [
    [0, 0],
    [inward, -1],
    [inward, 1],
  ]) {
    lookIn(squareIn(crop, cx + (ox * medium) / 3, cy + (oy * medium) / 4, medium))
  }
  return firstTile(candidates.slice(before))
}

// Checking a candidate at full resolution.

/** Part of the photo at full resolution, in linear light. */
interface Region {
  width: number
  height: number
  /** Red, green and blue in linear light, on a 0-255 scale; flattenRegion evens out the light. */
  channels: Float32Array[]
  /** Lightness for matching repeats against each other, filled in (and softened) by flattenRegion. */
  lightness: Float32Array
  /** 1 on garment, 0 off it. */
  garment: Float32Array
}

/** sRGB levels to linear light, on the same 0-255 scale. */
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, v) => {
  const c = v / 255
  return 255 * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
})

/** Linear light (0-255) back to an sRGB level. */
function toSrgb(v: number) {
  const c = Math.max(0, Math.min(1, v / 255))
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
}

/**
 * `rect` of the photo in linear light, so resampling and averaging repeats
 * keeps a fine bright line as bright as it looks (averaging sRGB levels dims
 * it), and light divides out as it really falls.
 */
function regionOf(image: RgbaImage, mask: Uint8Array, rect: Rect): Region {
  const { x, y, width: w, height: h } = rect
  const channels = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)]
  const garment = new Float32Array(w * h)
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const i = (y + ry) * image.width + x + rx
      const k = ry * w + rx
      channels[0][k] = TO_LINEAR[image.data[i * 4]]
      channels[1][k] = TO_LINEAR[image.data[i * 4 + 1]]
      channels[2][k] = TO_LINEAR[image.data[i * 4 + 2]]
      garment[k] = mask[i] ? 1 : 0
    }
  }
  return { width: w, height: h, channels, lightness: new Float32Array(w * h), garment }
}

/**
 * Divides out the light: each pixel is scaled by how far the mean over a box
 * of `bx` x `by` around it sits from the mean over the whole region. Given a
 * box of whole repeats, the pattern inside it is the same everywhere, so only
 * light and shadow change it. Then works out the lightness used for
 * matching, softened by a share of the `repeat` so the weave's grain doesn't
 * drown the pattern.
 */
function flattenRegion(region: Region, bx: number, by: number, repeat: number) {
  const { width: w, height: h, channels, garment, lightness } = region
  const [c0, c1, c2] = channels
  // The light changes slowly, so it's measured on blocks a sixteenth of a
  // repeat across and interpolated back.
  const f = Math.max(1, Math.floor(Math.min(bx, by) / 16))
  const gw = Math.ceil(w / f)
  const gh = Math.ceil(h / f)
  const bm = new Float64Array(gw * gh)
  const b0 = new Float64Array(gw * gh)
  const b1 = new Float64Array(gw * gh)
  const b2 = new Float64Array(gw * gh)
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / f) * gw
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const mk = garment[k]
      if (!mk) continue
      const g = row + Math.floor(x / f)
      bm[g] += mk
      b0[g] += c0[k]
      b1[g] += c1[k]
      b2[g] += c2[k]
    }
  }
  const stride = gw + 1
  const summedArea = (blocks: Float64Array) => {
    const out = new Float64Array(stride * (gh + 1))
    for (let y = 0; y < gh; y++) {
      let run = 0
      for (let x = 0; x < gw; x++) {
        run += blocks[y * gw + x]
        out[(y + 1) * stride + x + 1] = out[y * stride + x + 1] + run
      }
    }
    return out
  }
  const sm = summedArea(bm)
  const s0 = summedArea(b0)
  const s1 = summedArea(b1)
  const s2 = summedArea(b2)
  const total = Math.max(1, sm[gh * stride + gw])
  const mean0 = s0[gh * stride + gw] / total
  const mean1 = s1[gh * stride + gw] / total
  const mean2 = s2[gh * stride + gw] / total
  const hx = Math.max(1, Math.round((bx / f - 1) / 2))
  const hy = Math.max(1, Math.round((by / f - 1) / 2))
  const full = (2 * hx + 1) * (2 * hy + 1) * f * f
  const g0 = new Float32Array(gw * gh).fill(1)
  const g1 = new Float32Array(gw * gh).fill(1)
  const g2 = new Float32Array(gw * gh).fill(1)
  const gain = (mean: number, local: number) => (local > 1 ? Math.max(0.4, Math.min(2.5, mean / local)) : 1)
  for (let y = 0; y < gh; y++) {
    const ya = Math.max(0, y - hy) * stride
    const yb = Math.min(gh, y + hy + 1) * stride
    for (let x = 0; x < gw; x++) {
      const xa = Math.max(0, x - hx)
      const xb = Math.min(gw, x + hx + 1)
      const count = sm[yb + xb] - sm[ya + xb] - sm[yb + xa] + sm[ya + xa]
      // Boxes mostly off the garment keep their light as it is.
      if (count <= 0.3 * full) continue
      const g = y * gw + x
      g0[g] = gain(mean0, (s0[yb + xb] - s0[ya + xb] - s0[yb + xa] + s0[ya + xa]) / count)
      g1[g] = gain(mean1, (s1[yb + xb] - s1[ya + xb] - s1[yb + xa] + s1[ya + xa]) / count)
      g2[g] = gain(mean2, (s2[yb + xb] - s2[ya + xb] - s2[yb + xa] + s2[ya + xa]) / count)
    }
  }
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) / f - 0.5))
    const y0 = Math.floor(gy)
    const y1 = Math.min(gh - 1, y0 + 1)
    const ty = gy - y0
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (!garment[k]) continue
      const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / f - 0.5))
      const x0 = Math.floor(gx)
      const x1 = Math.min(gw - 1, x0 + 1)
      const tx = gx - x0
      const a00 = y0 * gw + x0
      const a10 = y0 * gw + x1
      const a01 = y1 * gw + x0
      const a11 = y1 * gw + x1
      const w00 = (1 - tx) * (1 - ty)
      const w10 = tx * (1 - ty)
      const w01 = (1 - tx) * ty
      const w11 = tx * ty
      c0[k] *= g0[a00] * w00 + g0[a10] * w10 + g0[a01] * w01 + g0[a11] * w11
      c1[k] *= g1[a00] * w00 + g1[a10] * w10 + g1[a01] * w01 + g1[a11] * w11
      c2[k] *= g2[a00] * w00 + g2[a10] * w10 + g2[a01] * w01 + g2[a11] * w11
      lightness[k] = 16 * Math.sqrt(0.2126 * c0[k] + 0.7152 * c1[k] + 0.0722 * c2[k])
    }
  }
  const soften = Math.max(0, Math.min(4, Math.round(repeat / 12)))
  if (soften > 0) {
    const blurred = blurMasked(Float64Array.from(lightness), Float64Array.from(garment), w, h, soften, 1)
    for (let k = 0; k < w * h; k++) lightness[k] = blurred[k]
  }
}

/**
 * Window points, every `stride` pixels, that stay on garment for every
 * shift in the box from (x0, y0) to (x1, y1). Correlations compared across
 * those shifts are then all taken over the same pixels; a set that changed
 * with the shift would pull the best shift towards the garment's middle.
 */
function steadyPoints(region: Region, win: Rect, x0: number, y0: number, x1: number, y1: number, stride: number) {
  const { width: w, height: h, garment } = region
  const points: number[] = []
  for (let y = win.y; y < win.y + win.height; y += stride) {
    if (y + y0 < 0 || y + y1 >= h) continue
    for (let x = win.x; x < win.x + win.width; x += stride) {
      if (x + x0 < 0 || x + x1 >= w) continue
      const i = y * w + x
      if (!garment[i] || !garment[i + y0 * w + x0] || !garment[i + y0 * w + x1] || !garment[i + y1 * w + x0] || !garment[i + y1 * w + x1]) continue
      points.push(i)
    }
  }
  return Int32Array.from(points)
}

/** Correlation of the lightness at `points` with itself shifted by (sx, sy); -1 if too few points are on garment both ways. */
function steadyNcc(region: Region, points: Int32Array, sx: number, sy: number) {
  const { width: w, lightness, garment } = region
  const offset = sy * w + sx
  let n = 0
  let sa = 0
  let sb = 0
  let saa = 0
  let sbb = 0
  let sab = 0
  for (let k = 0; k < points.length; k++) {
    const i = points[k]
    const j = i + offset
    if (!garment[j]) continue
    const a = lightness[i]
    const b = lightness[j]
    n++
    sa += a
    sb += b
    saa += a * a
    sbb += b * b
    sab += a * b
  }
  if (n < 50) return -1
  const cov = sab - (sa * sb) / n
  const va = saa - (sa * sa) / n
  const vb = sbb - (sb * sb) / n
  return va > 1e-6 && vb > 1e-6 ? cov / Math.sqrt(va * vb) : -1
}

/** Correlation of the window's lightness with itself moved by a whole-pixel shift, over garment pixels every `stride`. */
function shiftNcc(region: Region, win: Rect, sx: number, sy: number, stride: number) {
  const { width: w, height: h, lightness, garment } = region
  let n = 0
  let sa = 0
  let sb = 0
  let saa = 0
  let sbb = 0
  let sab = 0
  for (let y = win.y; y < win.y + win.height; y += stride) {
    const ty = y + sy
    if (ty < 0 || ty >= h) continue
    for (let x = win.x; x < win.x + win.width; x += stride) {
      const tx = x + sx
      if (tx < 0 || tx >= w) continue
      const i = y * w + x
      const j = ty * w + tx
      if (!garment[i] || !garment[j]) continue
      const a = lightness[i]
      const b = lightness[j]
      n++
      sa += a
      sb += b
      saa += a * a
      sbb += b * b
      sab += a * b
    }
  }
  if (n < 50) return -1
  const cov = sab - (sa * sb) / n
  const va = saa - (sa * sa) / n
  const vb = sbb - (sb * sb) / n
  return va > 1e-6 && vb > 1e-6 ? cov / Math.sqrt(va * vb) : -1
}

/**
 * Sharpens a repeat vector: the shift by n repeats is found to the pixel for
 * growing n, so the error in one repeat shrinks to a fraction of a pixel.
 * `match` is how well one repeat matched (-1 if it didn't hold up at all).
 */
function refineVector(region: Region, win: Rect, start: Vec, radius: number): { vector: Vec; match: number } {
  const stride = Math.max(2, Math.round(Math.min(win.width, win.height) / 110))
  let vector = start
  let first = -1
  const maxN = Math.max(1, Math.floor((0.55 * Math.min(win.width, win.height)) / lengthOf(start)))
  for (let n = 1; n <= maxN; n++) {
    const R = n === 1 ? radius : 2
    const cx = Math.round(vector[0] * n)
    const cy = Math.round(vector[1] * n)
    const scores = new Map<number, number>()
    const points = steadyPoints(region, win, cx - R - 3, cy - R - 3, cx + R + 3, cy + R + 3, stride)
    const score = (x: number, y: number) => {
      const key = (y + 4096) * 8192 + x + 4096
      let value = scores.get(key)
      if (value === undefined) {
        value = steadyNcc(region, points, x, y)
        scores.set(key, value)
      }
      return value
    }
    // A coarse search over the box, then every pixel round the best.
    let best = -2
    let bx = cx
    let by = cy
    const step = R > 6 ? 3 : R > 3 ? 2 : 1
    for (let y = cy - R; y <= cy + R; y += step) {
      for (let x = cx - R; x <= cx + R; x += step) {
        const value = score(x, y)
        if (value > best) {
          best = value
          bx = x
          by = y
        }
      }
    }
    if (step > 1) {
      const sx = bx
      const sy = by
      const reach = step - 1
      for (let y = sy - reach; y <= sy + reach; y++) {
        for (let x = sx - reach; x <= sx + reach; x++) {
          const value = score(x, y)
          if (value > best) {
            best = value
            bx = x
            by = y
          }
        }
      }
    }
    if (best < 0.25) break
    const ox = parabolaPeak(score(bx - 1, by), best, score(bx + 1, by))
    const oy = parabolaPeak(score(bx, by - 1), best, score(bx, by + 1))
    vector = [(bx + ox) / n, (by + oy) / n]
    if (n === 1) first = best
  }
  return { vector, match: first }
}

/**
 * Sharpens a candidate's repeat vectors at full resolution. For stripes any
 * shift along them is a repeat, so only their direction and the spacing
 * across them are sharpened, and a cell is kept short along them so a stripe
 * that wanders stays sharp. Null if the repeats don't hold up.
 */
function refineLattice(region: Region, local: Rect, found: Found, scale: number): { u: Vec; v: Vec } | null {
  let u: Vec
  let v: Vec
  let matches: [number, number]
  if (found.kind === 'grid') {
    const ru = refineVector(region, local, found.u, Math.max(scale + 1, Math.ceil(LATTICE.refineShare * lengthOf(found.u))))
    const rv = refineVector(region, local, found.v, Math.max(scale + 1, Math.ceil(LATTICE.refineShare * lengthOf(found.v))))
    u = ru.vector
    v = rv.vector
    matches = [ru.match, rv.match]
  } else {
    const vertical = found.across === 'u'
    const across = vertical ? found.u : found.v
    const alongStart = scaled(vertical ? found.v : found.u, Math.max(LATTICE.cellTarget, lengthOf(across)))
    const ra = refineVector(region, local, alongStart, scale + 2)
    const rc = refineVector(region, local, across, scale + 1)
    const along = scaled(ra.vector, 1 / lengthOf(ra.vector))
    const normal: Vec = [along[1], -along[0]]
    const spacing = Math.abs(rc.vector[0] * normal[0] + rc.vector[1] * normal[1])
    const n: Vec = vertical ? (normal[0] > 0 ? normal : scaled(normal, -1)) : normal[1] > 0 ? normal : scaled(normal, -1)
    const cellAlong = Math.max(LATTICE.stripeCell, 3 * spacing)
    u = vertical ? scaled(n, spacing) : scaled(along, cellAlong)
    v = vertical ? scaled(along, cellAlong) : scaled(n, spacing)
    matches = [rc.match, ra.match]
  }
  if (Math.abs(cross(u, v)) < 1 || !(toThousandths(matches[0]) > 0.25 && toThousandths(matches[1]) > 0.25)) return null
  return { u, v }
}

/**
 * Stripes repeat along any shift down them, so a grid can be read off their
 * ridges at a slant. If the window barely changes when moved one way but
 * does when moved another, it holds stripes: returns the angle they run at,
 * else null.
 */
function stripeDirection(region: Region, local: Rect, u: Vec, v: Vec): number | null {
  const reach = Math.max(2, Math.round(0.35 * Math.min(lengthOf(u), lengthOf(v))))
  const stride = Math.max(2, Math.round(Math.min(local.width, local.height) / 110))
  let bestAngle = 0
  let bestNcc = -2
  let worst = 2
  for (let deg = 0; deg < 180; deg += 7.5) {
    const a = (deg * Math.PI) / 180
    const value = shiftNcc(region, local, Math.round(reach * Math.cos(a)), Math.round(reach * Math.sin(a)), stride)
    if (value > bestNcc) {
      bestNcc = value
      bestAngle = a
    }
    worst = Math.min(worst, value)
  }
  return bestNcc >= LATTICE.stripeNcc && worst <= LATTICE.stripeNcc - 0.3 ? bestAngle : null
}

/**
 * The stripes running at `angle`, spaced by the first clear repeat of the
 * window moved straight across them. Null if there's no clear repeat or
 * they lean too far off the photo's axes.
 */
function stripesAlong(region: Region, local: Rect, angle: number, strength: number): Found | null {
  const normal: Vec = [-Math.sin(angle), Math.cos(angle)]
  const stride = Math.max(2, Math.round(Math.min(local.width, local.height) / 110))
  const at = (t: number) => shiftNcc(region, local, Math.round(t * normal[0]), Math.round(t * normal[1]), stride)
  let spacing = Infinity
  let lowest = Infinity
  const maxT = Math.floor(0.4 * Math.min(local.width, local.height))
  for (let t = Math.max(2, LATTICE.minPeriodPx); t < maxT; t++) {
    const value = at(t)
    lowest = Math.min(lowest, value)
    if (value >= 0.25 && value - lowest >= LATTICE.dip && value >= at(t - 1) && value >= at(t + 1)) {
      spacing = t + parabolaPeak(at(t - 1), value, at(t + 1))
      break
    }
  }
  if (!Number.isFinite(spacing) || Math.max(Math.abs(normal[0]), Math.abs(normal[1])) < axisCosine()) return null
  return stripesAcross(normal, spacing, strength)
}

/** Where a lattice's cells sit: cell (i, j) spans origin + (i + s) U + (j + t) V for s and t from 0 to 1. */
interface Frame {
  U: Vec
  V: Vec
  origin: Vec
  det: number
}

/** A frame with edges U and V, placed so cell (0, 0) is centred on `centre`. */
function frameAround(centre: Vec, U: Vec, V: Vec): Frame {
  return { U, V, origin: [centre[0] - (U[0] + V[0]) / 2, centre[1] - (U[1] + V[1]) / 2], det: cross(U, V) }
}

/** The point at (s, t) within cell (i, j), moved by `shift`. */
function cellPoint({ U, V, origin }: Frame, i: number, j: number, s: number, t: number, shift: Vec): Vec {
  return [origin[0] + (i + s) * U[0] + (j + t) * V[0] + shift[0], origin[1] + (i + s) * U[1] + (j + t) * V[1] + shift[1]]
}

/** Where the point (x, y) falls in the lattice, in cells. */
function latticeCoords({ U, V, origin, det }: Frame, x: number, y: number): Vec {
  const qx = x - origin[0]
  const qy = y - origin[1]
  return [(qx * V[1] - qy * V[0]) / det, (U[0] * qy - U[1] * qx) / det]
}

/** One cell of the lattice over the window. */
interface Cell {
  i: number
  j: number
  /** How far it was moved, in photo pixels, to line up with the pattern. */
  shift: Vec
  /** How well it then matched the pattern. */
  match: number
  /** The share of it on garment. */
  cover: number
  /** Its say in the fold; 0 if it matched worse than LATTICE.minCellNcc. */
  weight: number
  /** Its lightness on the alignment grid, NaN off the garment. */
  samples: Float32Array
}

/** The region's matching lightness at a point, interpolated between garment pixels; NaN where under half of it is garment. */
function lightnessAt(region: Region, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= region.width || y0 + 1 >= region.height) return NaN
  const fx = x - x0
  const fy = y - y0
  const k = y0 * region.width + x0
  const { lightness, garment, width: w } = region
  const w00 = (1 - fx) * (1 - fy) * garment[k]
  const w10 = fx * (1 - fy) * garment[k + 1]
  const w01 = (1 - fx) * fy * garment[k + w]
  const w11 = fx * fy * garment[k + w + 1]
  const total = w00 + w10 + w01 + w11
  if (total < 0.5) return NaN
  return (lightness[k] * w00 + lightness[k + 1] * w10 + lightness[k + w] * w01 + lightness[k + w + 1] * w11) / total
}

/** Correlation of two sample grids over the samples both have; -1 if under half do. */
function maskedNcc(a: Float32Array, b: Float32Array) {
  let n = 0
  let sa = 0
  let sb = 0
  let saa = 0
  let sbb = 0
  let sab = 0
  for (let k = 0; k < a.length; k++) {
    const x = a[k]
    const y = b[k]
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    n++
    sa += x
    sb += y
    saa += x * x
    sbb += y * y
    sab += x * y
  }
  if (n < a.length * 0.5) return -1
  const va = saa - (sa * sa) / n
  const vb = sbb - (sb * sb) / n
  return va > 1e-6 && vb > 1e-6 ? (sab - (sa * sb) / n) / Math.sqrt(va * vb) : -1
}

/** The weighted mean of the cells' samples, NaN where no weighted cell has one: the pattern as found so far. */
function cellTemplate(cells: Cell[], size: number): Float32Array {
  const sum = new Float64Array(size)
  const weight = new Float64Array(size)
  for (const cell of cells) {
    if (!cell.weight) continue
    for (let k = 0; k < size; k++) {
      const value = cell.samples[k]
      if (Number.isNaN(value)) continue
      sum[k] += cell.weight * value
      weight[k] += cell.weight
    }
  }
  const template = new Float32Array(size)
  for (let k = 0; k < size; k++) template[k] = weight[k] > 0 ? sum[k] / weight[k] : NaN
  return template
}

/** Solves the 3 x 3 system A x = b (A given row by row) by Gauss-Jordan elimination; null if A is singular. */
function solve3(A: Float64Array, b: Float64Array): number[] | null {
  const M = [0, 1, 2].map((r) => [A[r * 3], A[r * 3 + 1], A[r * 3 + 2], b[r]])
  for (let c = 0; c < 3; c++) {
    let pivot = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r
    const row = M[c]
    M[c] = M[pivot]
    M[pivot] = row
    if (Math.abs(M[c][c]) < 1e-9) return null
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const k = M[r][c] / M[c][c]
      for (let q = c; q < 4; q++) M[r][q] -= k * M[c][q]
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}

/**
 * The steady part of the cells' drift, from a weighted least-squares fit of
 * each fully covered cell's shift to a + i du + j dv: `du` and `dv` are how
 * far off each step along U and V is. Null if the fit is singular.
 */
function steadyDrift(cells: Cell[]): { du: Vec; dv: Vec } | null {
  const A = new Float64Array(9)
  const bx = new Float64Array(3)
  const by = new Float64Array(3)
  for (const cell of cells) {
    if (!cell.weight || cell.cover < 0.97) continue
    const f = [1, cell.i, cell.j]
    for (let r = 0; r < 3; r++) {
      bx[r] += cell.weight * f[r] * cell.shift[0]
      by[r] += cell.weight * f[r] * cell.shift[1]
      for (let c = 0; c < 3; c++) A[r * 3 + c] += cell.weight * f[r] * f[c]
    }
  }
  const sx = solve3(A, bx)
  const sy = solve3(A, by)
  if (!sx || !sy) return null
  return { du: [sx[1], sy[1]], dv: [sx[2], sy[2]] }
}

/** Cells lined up with the pattern over the window, ready to fold. */
interface Lattice {
  cells: Cell[]
  frame: Frame
  /** How many base repeats each cell groups along U and along V. */
  ku: number
  kv: number
}

/**
 * Lays cells of the refined lattice over the window and lines each one up
 * with the pattern, starting at the centre and carrying each cell's drift on
 * to its neighbours, so folds and perspective don't blur the fold. Repeats
 * shorter than LATTICE.cellTarget are grouped into larger cells first. A
 * steady drift from cell to cell means the repeat is a little off, so it's
 * taken into the repeat vectors and the cells are lined up again. Null if
 * the centre cell is mostly off the garment or the drift is too large.
 */
function alignCells(region: Region, local: Rect, u: Vec, v: Vec, stripes: boolean, vertical: boolean): Lattice | null {
  const ku = stripes && !vertical ? 1 : Math.max(1, Math.round(LATTICE.cellTarget / lengthOf(u)))
  const kv = stripes && vertical ? 1 : Math.max(1, Math.round(LATTICE.cellTarget / lengthOf(v)))
  const centre: Vec = [local.x + local.width / 2, local.y + local.height / 2]
  let frame = frameAround(centre, scaled(u, ku), scaled(v, kv))
  // Enough samples per cell to see its finest repeat: four per base repeat.
  const GA = Math.min(48, Math.max(LATTICE.alignGrid, 4 * ku))
  const GB = Math.min(48, Math.max(LATTICE.alignGrid, 4 * kv))
  const size = GA * GB

  /** Samples cell (i, j), moved by `shift`, on the GA x GB grid into `out`; returns the share on garment. */
  const sampleCell = (i: number, j: number, shift: Vec, out: Float32Array) => {
    let cover = 0
    const [x0, y0] = cellPoint(frame, i, j, 0.5 / GA, 0.5 / GB, shift)
    const ax = frame.U[0] / GA
    const ay = frame.U[1] / GA
    const bx = frame.V[0] / GB
    const by = frame.V[1] / GB
    for (let b = 0; b < GB; b++) {
      for (let a = 0; a < GA; a++) {
        const value = lightnessAt(region, x0 + a * ax + b * bx, y0 + a * ay + b * by)
        out[b * GA + a] = value
        if (!Number.isNaN(value)) cover++
      }
    }
    return cover / size
  }

  let cells: Cell[] = []
  /** A cell for each repeat centred in the window, nearest the centre first; false if the centre cell is mostly off the garment. */
  const layCells = () => {
    cells = []
    const corners = [
      latticeCoords(frame, local.x, local.y),
      latticeCoords(frame, local.x + local.width, local.y),
      latticeCoords(frame, local.x, local.y + local.height),
      latticeCoords(frame, local.x + local.width, local.y + local.height),
    ]
    const imin = Math.floor(Math.min(...corners.map((q) => q[0])))
    const imax = Math.ceil(Math.max(...corners.map((q) => q[0])))
    const jmin = Math.floor(Math.min(...corners.map((q) => q[1])))
    const jmax = Math.ceil(Math.max(...corners.map((q) => q[1])))
    for (let j = jmin; j <= jmax; j++) {
      for (let i = imin; i <= imax; i++) {
        const [x, y] = cellPoint(frame, i, j, 0.5, 0.5, [0, 0])
        if (x < local.x || x >= local.x + local.width || y < local.y || y >= local.y + local.height) continue
        const samples = new Float32Array(size)
        const cover = sampleCell(i, j, [0, 0], samples)
        cells.push({ i, j, shift: [0, 0], match: 0, cover, weight: 0, samples })
      }
    }
    cells.sort((a, b) => Math.hypot(a.i, a.j) - Math.hypot(b.i, b.j))
    cells.length = Math.min(cells.length, LATTICE.maxCells)
    const centreCell = cells[0]
    return !!centreCell && centreCell.i === 0 && centreCell.j === 0 && centreCell.cover >= 0.6
  }

  // A cell's sample positions at no shift, split into whole pixel and
  // fraction: a whole-pixel shift then just moves the index, with the same weights.
  const tapX = new Int32Array(size)
  const tapY = new Int32Array(size)
  const tapFx = new Float32Array(size)
  const tapFy = new Float32Array(size)
  const prepareTaps = (cell: Cell) => {
    const [x0, y0] = cellPoint(frame, cell.i, cell.j, 0.5 / GA, 0.5 / GB, [0, 0])
    const ax = frame.U[0] / GA
    const ay = frame.U[1] / GA
    const bx = frame.V[0] / GB
    const by = frame.V[1] / GB
    for (let b = 0; b < GB; b++) {
      for (let a = 0; a < GA; a++) {
        const k = b * GA + a
        const x = x0 + a * ax + b * bx
        const y = y0 + a * ay + b * by
        tapX[k] = Math.floor(x)
        tapY[k] = Math.floor(y)
        tapFx[k] = x - tapX[k]
        tapFy[k] = y - tapY[k]
      }
    }
  }
  const { width: rw, height: rh, lightness, garment } = region
  /** The prepared cell's samples moved by a whole-pixel (dx, dy), into `out`. */
  const sampleShifted = (dx: number, dy: number, out: Float32Array) => {
    for (let k = 0; k < size; k++) {
      const x = tapX[k] + dx
      const y = tapY[k] + dy
      if (x < 0 || y < 0 || x + 1 >= rw || y + 1 >= rh) {
        out[k] = NaN
        continue
      }
      const fx = tapFx[k]
      const fy = tapFy[k]
      const q = y * rw + x
      const w00 = (1 - fx) * (1 - fy) * garment[q]
      const w10 = fx * (1 - fy) * garment[q + 1]
      const w01 = (1 - fx) * fy * garment[q + rw]
      const w11 = fx * fy * garment[q + rw + 1]
      const total = w00 + w10 + w01 + w11
      out[k] = total < 0.5 ? NaN : (lightness[q] * w00 + lightness[q + 1] * w10 + lightness[q + rw] * w01 + lightness[q + rw + 1] * w11) / total
    }
  }

  const R = Math.max(2, Math.min(LATTICE.alignMax, Math.ceil(LATTICE.alignShare * Math.max(lengthOf(frame.U), lengthOf(frame.V)))))
  let reach = R
  const scratch = new Float32Array(size)
  // Each cell's scores by shift, kept by offset from where its search
  // started (which they never stray further from than R + 3); a stamp marks
  // those that belong to the current cell, so nothing needs clearing.
  const memoReach = R + 3
  const memoSide = 2 * memoReach + 1
  const memoScore = new Float64Array(memoSide * memoSide)
  const memoStamp = new Uint32Array(memoSide * memoSide)
  let stamp = 0
  // Stripes only need lining up straight across them, in whole pixels along x or y.
  const acrossStripes = stripes ? (vertical ? scaled(frame.U, 1 / lengthOf(frame.U)) : scaled(frame.V, 1 / lengthOf(frame.V))) : null
  const stepsAlongX = acrossStripes !== null && Math.abs(acrossStripes[0]) >= Math.abs(acrossStripes[1])

  /** Lines every cell up against `template`, each starting from the mean shift of its neighbours lined up so far. */
  const alignAll = (template: Float32Array) => {
    let imin = Infinity
    let imax = -Infinity
    let jmin = Infinity
    let jmax = -Infinity
    for (const cell of cells) {
      imin = Math.min(imin, cell.i)
      imax = Math.max(imax, cell.i)
      jmin = Math.min(jmin, cell.j)
      jmax = Math.max(jmax, cell.j)
    }
    const columns = imax - imin + 1
    const placed = new Uint8Array(columns * (jmax - jmin + 1))
    const placedX = new Float64Array(placed.length)
    const placedY = new Float64Array(placed.length)
    const slot = (i: number, j: number) => (i < imin || i > imax || j < jmin || j > jmax ? -1 : (j - jmin) * columns + i - imin)

    for (const cell of cells) {
      prepareTaps(cell)
      let px = 0
      let py = 0
      let count = 0
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const s = slot(cell.i + di, cell.j + dj)
          if (s < 0 || !placed[s]) continue
          px += placedX[s]
          py += placedY[s]
          count++
        }
      }
      const ox = count ? Math.round(px / count) : 0
      const oy = count ? Math.round(py / count) : 0
      stamp++
      const score = (x: number, y: number) => {
        const mx = x - ox + memoReach
        const my = y - oy + memoReach
        const kept = mx >= 0 && my >= 0 && mx < memoSide && my < memoSide
        const k = my * memoSide + mx
        if (kept && memoStamp[k] === stamp) return memoScore[k]
        sampleShifted(x, y, scratch)
        const value = maskedNcc(scratch, template)
        if (kept) {
          memoScore[k] = value
          memoStamp[k] = stamp
        }
        return value
      }
      let best = -2
      let bx = ox
      let by = oy
      if (acrossStripes) {
        // Whole-pixel steps straight across the stripes, then the fraction.
        for (let t = -reach; t <= reach; t++) {
          const x = stepsAlongX ? ox + t : ox
          const y = stepsAlongX ? oy : oy + t
          const value = score(x, y)
          if (value > best) {
            best = value
            bx = x
            by = y
          }
        }
        const f = stepsAlongX
          ? parabolaPeak(score(bx - 1, by), best, score(bx + 1, by))
          : parabolaPeak(score(bx, by - 1), best, score(bx, by + 1))
        cell.shift = stepsAlongX ? [bx + f, by] : [bx, by + f]
      } else {
        // A coarse search, every pixel round the best, then the fraction.
        const step = reach > 6 ? 3 : 2
        for (let y = oy - reach; y <= oy + reach; y += step) {
          for (let x = ox - reach; x <= ox + reach; x += step) {
            const value = score(x, y)
            if (value > best) {
              best = value
              bx = x
              by = y
            }
          }
        }
        const cx = bx
        const cy = by
        for (let y = cy - step + 1; y <= cy + step - 1; y++) {
          for (let x = cx - step + 1; x <= cx + step - 1; x++) {
            const value = score(x, y)
            if (value > best) {
              best = value
              bx = x
              by = y
            }
          }
        }
        const fx = parabolaPeak(score(bx - 1, by), best, score(bx + 1, by))
        const fy = parabolaPeak(score(bx, by - 1), best, score(bx, by + 1))
        cell.shift = [bx + fx, by + fy]
      }
      cell.match = best
      cell.cover = sampleCell(cell.i, cell.j, cell.shift, cell.samples)
      cell.weight = best >= LATTICE.minCellNcc ? best * best * Math.min(1, cell.cover / 0.8) : 0
      if (best >= LATTICE.minCellNcc) {
        const s = slot(cell.i, cell.j)
        placed[s] = 1
        placedX[s] = cell.shift[0]
        placedY[s] = cell.shift[1]
      }
    }
  }

  let template: Float32Array | null = null
  /** Lays the cells and lines them up: first against the centre cell and then their mean, later against the pattern so far. */
  const settle = () => {
    if (!layCells()) return false
    if (template) {
      // A small correction: the cells sit nearly in place against the pattern found so far.
      reach = Math.max(2, Math.ceil(R / 2))
      alignAll(template)
    } else {
      alignAll(new Float32Array(cells[0].samples))
      alignAll(cellTemplate(cells, size))
    }
    template = cellTemplate(cells, size)
    return true
  }

  if (!settle()) return null
  for (let round = 0; round < 3; round++) {
    const drift = steadyDrift(cells)
    if (!drift) break
    let { du, dv } = drift
    const { U, V } = frame
    if (stripes) {
      // Along the stripes any shift is a repeat; only the part across them counts.
      const n: Vec = vertical ? scaled(U, 1 / lengthOf(U)) : scaled(V, 1 / lengthOf(V))
      du = scaled(n, du[0] * n[0] + du[1] * n[1])
      dv = scaled(n, dv[0] * n[0] + dv[1] * n[1])
    }
    // A drift is only taken up if the whole window agrees: moved by the
    // corrected repeat, it must match itself at least as well as before.
    // (Cells can wander along a faint direction without the repeat being off.)
    const stride = Math.max(2, Math.round(Math.min(local.width, local.height) / 110))
    const agrees = (w: Vec, dw: Vec) =>
      shiftNcc(region, local, Math.round(w[0] + dw[0]), Math.round(w[1] + dw[1]), stride) >=
      shiftNcc(region, local, Math.round(w[0]), Math.round(w[1]), stride) - 0.005
    if (lengthOf(du) >= 0.5 && !agrees(U, du)) du = [0, 0]
    if (lengthOf(dv) >= 0.5 && !(stripes && vertical) && !agrees(V, dv)) dv = [0, 0]
    if (lengthOf(du) < 0.001 * lengthOf(U) && lengthOf(dv) < 0.001 * lengthOf(V)) break
    if (lengthOf(du) > 0.3 * lengthOf(U) || lengthOf(dv) > 0.3 * lengthOf(V)) return null
    frame = frameAround(centre, [U[0] + du[0], U[1] + du[1]], [V[0] + dv[0], V[1] + dv[1]])
    if (!settle()) return null
  }
  return { cells, frame, ku, kv }
}

/**
 * How much of the window's variation the lattice explains, from 0 to 1:
 * each cell used is predicted from the weighted mean of the others, and the
 * cells left out count as wholly unexplained.
 */
function leaveOneOutFit(cells: Cell[], used: Cell[]): number {
  const size = cells[0].samples.length
  const sum = new Float64Array(size)
  const weight = new Float64Array(size)
  for (const cell of used) {
    for (let k = 0; k < size; k++) {
      const value = cell.samples[k]
      if (Number.isNaN(value)) continue
      sum[k] += cell.weight * value
      weight[k] += cell.weight
    }
  }
  let total = 0
  let count = 0
  for (const cell of cells) {
    for (let k = 0; k < size; k++) {
      if (Number.isNaN(cell.samples[k])) continue
      total += cell.samples[k]
      count++
    }
  }
  const mean = total / Math.max(1, count)
  let sst = 0
  let sse = 0
  for (const cell of cells) {
    for (let k = 0; k < size; k++) {
      const value = cell.samples[k]
      if (Number.isNaN(value)) continue
      sst += (value - mean) ** 2
      if (!cell.weight) {
        sse += (value - mean) ** 2
        continue
      }
      const rest = weight[k] - cell.weight
      const predicted = rest > 1e-6 ? (sum[k] - cell.weight * value) / rest : mean
      sse += (value - predicted) ** 2
    }
  }
  return 1 - sse / Math.max(1e-9, sst)
}

/** Each base repeat of the folded cells, resampled onto one base cell. */
interface Layers {
  /** For each layer and texel: linear red, green and blue, then a weight that is 0 off the garment. */
  store: Float32Array
  count: number
  /**
   * How many leading layers, the best cells' repeats, each texel is folded
   * from. The layers after them only stand in for texels none of those have.
   */
  core: number
  /** Texels in the base cell. */
  texels: number
}

/**
 * Scratch for the resampled repeats, reused from call to call: it runs to
 * megabytes for a large check, and a fresh one each time showed up as
 * garbage-collection pauses. Every texel's weight is written before it's
 * read, and its colour wherever its weight is above 0, so nothing stale is
 * ever used.
 */
let layerScratch = new Float32Array(0)

/**
 * Resamples each base repeat of the `sources` cells onto a Bw x Bh base cell,
 * in linear light: by Catmull-Rom inside solid garment, so fine lines keep
 * their contrast, and bilinearly between garment pixels near its edge. Each
 * texel's weight is its garment share times its cell's weight. Given `from`,
 * the layers of the sources before it are kept as they are and only the
 * rest are sampled, after them.
 */
function sampleRepeats(region: Region, sources: Cell[], lattice: Lattice, Bw: number, Bh: number, from = 0): Layers {
  const { frame, ku, kv } = lattice
  const { U, V } = frame
  const P = Bw * Bh
  const count = sources.length * ku * kv
  if (layerScratch.length < count * P * 4) {
    const grown = new Float32Array(count * P * 4)
    grown.set(layerScratch.subarray(0, Math.min(layerScratch.length, from * ku * kv * P * 4)))
    layerScratch = grown
  }
  const store = layerScratch.subarray(0, count * P * 4)
  const { width: RW, height: RH, garment } = region
  const [R0, R1, R2] = region.channels
  let layer = from * ku * kv
  for (const cell of sources.slice(from)) {
    for (let b = 0; b < kv; b++) {
      for (let a = 0; a < ku; a++, layer++) {
        const [px0, py0] = cellPoint(frame, cell.i, cell.j, (a + 0.5 / Bw) / ku, (b + 0.5 / Bh) / kv, cell.shift)
        const dxx = U[0] / (Bw * ku)
        const dxy = U[1] / (Bw * ku)
        const dyx = V[0] / (Bh * kv)
        const dyy = V[1] / (Bh * kv)
        for (let y = 0; y < Bh; y++) {
          for (let x = 0; x < Bw; x++) {
            const sx = px0 + x * dxx + y * dyx
            const sy = py0 + x * dxy + y * dyy
            const o = (layer * P + y * Bw + x) * 4
            const ix = Math.floor(sx)
            const iy = Math.floor(sy)
            if (ix < 0 || iy < 0 || ix + 1 >= RW || iy + 1 >= RH) {
              store[o + 3] = 0
              continue
            }
            const fx = sx - ix
            const fy = sy - iy
            const k = iy * RW + ix
            const w00 = (1 - fx) * (1 - fy) * garment[k]
            const w10 = fx * (1 - fy) * garment[k + 1]
            const w01 = (1 - fx) * fy * garment[k + RW]
            const w11 = fx * fy * garment[k + RW + 1]
            const total = w00 + w10 + w01 + w11
            if (total < 1e-6) {
              store[o + 3] = 0
              continue
            }
            store[o + 3] = total * cell.weight
            if (total > 0.999 && ix >= 1 && iy >= 1 && ix + 2 < RW && iy + 2 < RH) {
              const wx0 = ((-fx + 2) * fx - 1) * fx * 0.5
              const wx1 = ((3 * fx - 5) * fx * fx + 2) * 0.5
              const wx2 = ((-3 * fx + 4) * fx + 1) * fx * 0.5
              const wx3 = (fx - 1) * fx * fx * 0.5
              const wy0 = ((-fy + 2) * fy - 1) * fy * 0.5
              const wy1 = ((3 * fy - 5) * fy * fy + 2) * 0.5
              const wy2 = ((-3 * fy + 4) * fy + 1) * fy * 0.5
              const wy3 = (fy - 1) * fy * fy * 0.5
              let solid = true
              let a0 = 0
              let a1 = 0
              let a2 = 0
              for (let ty = -1; ty <= 2 && solid; ty++) {
                const wy = ty === -1 ? wy0 : ty === 0 ? wy1 : ty === 1 ? wy2 : wy3
                const row = k + ty * RW
                for (let tx = -1; tx <= 2; tx++) {
                  const q = row + tx
                  if (!garment[q]) {
                    solid = false
                    break
                  }
                  const wt = wy * (tx === -1 ? wx0 : tx === 0 ? wx1 : tx === 1 ? wx2 : wx3)
                  a0 += R0[q] * wt
                  a1 += R1[q] * wt
                  a2 += R2[q] * wt
                }
              }
              if (solid) {
                store[o] = a0
                store[o + 1] = a1
                store[o + 2] = a2
                continue
              }
            }
            store[o] = (R0[k] * w00 + R0[k + 1] * w10 + R0[k + RW] * w01 + R0[k + RW + 1] * w11) / total
            store[o + 1] = (R1[k] * w00 + R1[k + 1] * w10 + R1[k + RW] * w01 + R1[k + RW + 1] * w11) / total
            store[o + 2] = (R2[k] * w00 + R2[k + 1] * w10 + R2[k + RW] * w01 + R2[k + RW + 1] * w11) / total
          }
        }
      }
    }
  }
  return { store, count, core: count, texels: P }
}

/** For each texel, 1 if none of the core layers has it on garment, so it's left to the stand-ins. */
function uncoveredTexels({ store, core, texels: P }: Layers): Uint8Array {
  const missing = new Uint8Array(P).fill(1)
  for (let n = 0; n < core; n++) {
    for (let k = 0; k < P; k++) if (store[(n * P + k) * 4 + 3] > 0) missing[k] = 0
  }
  return missing
}

/**
 * The best cells' repeats, ready to fold. The best cells can all miss the
 * same corner (where the garment's edge or a sleeve cuts them alike), which
 * would leave a hole in the tile, so the next best cells are added one at a
 * time to stand in there until every texel is seen. Null if none can.
 */
function repeatsToFold(region: Region, ranked: Cell[], lattice: Lattice, Bw: number, Bh: number): Layers | null {
  let taken = Math.min(LATTICE.topK, ranked.length)
  let layers = sampleRepeats(region, ranked.slice(0, taken), lattice, Bw, Bh)
  const core = layers.count
  const missing = uncoveredTexels(layers)
  let holes = missing.reduce((sum, m) => sum + m, 0)
  while (holes > 0 && taken < ranked.length) {
    layers = sampleRepeats(region, ranked.slice(0, ++taken), lattice, Bw, Bh, taken - 1)
    const { store, count, texels: P } = layers
    for (let n = count - lattice.ku * lattice.kv; n < count; n++) {
      for (let k = 0; k < P; k++) {
        if (missing[k] && store[(n * P + k) * 4 + 3] > 0) {
          missing[k] = 0
          holes--
        }
      }
    }
  }
  return holes > 0 ? null : { ...layers, core }
}

/**
 * Folds the layers into one cell: a weighted mean per texel and then, given
 * at least three layers, two rounds of a Cauchy-robust mean, so a crease or
 * a button in one repeat is outvoted by the others. Each texel is folded
 * from the core layers, or from the stand-ins where none of those has it.
 */
function foldRepeats(layered: Layers): Float64Array[] {
  const { store, count, core, texels: P } = layered
  const standIn = uncoveredTexels(layered)
  const first = (k: number) => (standIn[k] ? core : 0)
  const end = (k: number) => (standIn[k] ? count : core)
  const channels = [new Float64Array(P), new Float64Array(P), new Float64Array(P)]
  const [c0, c1, c2] = channels
  const fold = (robust: number) => {
    const inv = robust > 0 ? 1 / (robust * robust) : 0
    for (let k = 0; k < P; k++) {
      let wsum = 0
      let r = 0
      let g = 0
      let b = 0
      for (let n = first(k); n < end(k); n++) {
        const o = (n * P + k) * 4
        let wt = store[o + 3]
        if (wt <= 0) continue
        if (robust > 0) {
          const d0 = store[o] - c0[k]
          const d1 = store[o + 1] - c1[k]
          const d2 = store[o + 2] - c2[k]
          wt /= 1 + (d0 * d0 + d1 * d1 + d2 * d2) * inv
        }
        wsum += wt
        r += wt * store[o]
        g += wt * store[o + 1]
        b += wt * store[o + 2]
      }
      if (wsum > 0) {
        c0[k] = r / wsum
        c1[k] = g / wsum
        c2[k] = b / wsum
      }
    }
  }
  fold(0)
  if (core >= 3) {
    // Outliers are weighed down on a scale of a multiple of the typical residual.
    const residuals: number[] = []
    for (let k = 0; k < P; k += 7) {
      for (let n = first(k); n < end(k); n++) {
        const o = (n * P + k) * 4
        if (store[o + 3] <= 0) continue
        const d0 = store[o] - c0[k]
        const d1 = store[o + 1] - c1[k]
        const d2 = store[o + 2] - c2[k]
        residuals.push(Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2))
      }
    }
    residuals.sort((a, b) => a - b)
    const typical = residuals[Math.floor(residuals.length / 2)] ?? 10
    fold(Math.max(6, 2.5 * typical))
    fold(Math.max(6, 2.5 * typical))
  }
  return channels
}

/**
 * The share of its layers' mean lightness spread the folded cell keeps.
 * Folding repeats that don't truly line up averages the pattern away.
 */
function keptSpread({ store, count: layers, texels: P }: Layers, [c0, c1, c2]: Float64Array[]): number {
  let layerSd = 0
  let layerCount = 0
  for (let n = 0; n < layers; n++) {
    let s1 = 0
    let s2 = 0
    let c = 0
    for (let k = 0; k < P; k++) {
      const o = (n * P + k) * 4
      if (store[o + 3] <= 0) continue
      const y = 0.2126 * store[o] + 0.7152 * store[o + 1] + 0.0722 * store[o + 2]
      s1 += y
      s2 += y * y
      c++
    }
    // Layers mostly off the garment don't count.
    if (c < P * 0.5) continue
    layerSd += Math.sqrt(Math.max(0, s2 / c - (s1 / c) ** 2))
    layerCount++
  }
  let f1 = 0
  let f2 = 0
  for (let k = 0; k < P; k++) {
    const y = 0.2126 * c0[k] + 0.7152 * c1[k] + 0.0722 * c2[k]
    f1 += y
    f2 += y * y
  }
  const foldSd = Math.sqrt(Math.max(0, f2 / P - (f1 / P) ** 2))
  return layerCount ? foldSd / (layerSd / layerCount) : 1
}

/** Side of the grid the cell's first few harmonics are sampled back on: plenty for nothing finer than a quarter of the cell. */
const LOW_SIDE = 32

/**
 * A transformed Bw x Bh cell (`re`, `im`) with only its first few harmonics
 * each way, sampled back on a LOW_SIDE x LOW_SIDE grid over the cell. Those
 * harmonics are symmetric, so two real signals packed into one transform
 * come back whole in their own parts.
 */
function lowHarmonicsOf(re: Float64Array, im: Float64Array, Bw: number, Bh: number): [Float64Array, Float64Array] {
  const H = LATTICE.shadingHarmonics
  const outRe = new Float64Array(LOW_SIDE * LOW_SIDE)
  const outIm = new Float64Array(LOW_SIDE * LOW_SIDE)
  // The small inverse divides by its own size, not the cell's.
  const scale = (LOW_SIDE * LOW_SIDE) / (Bw * Bh)
  for (let fy = -H; fy <= H; fy++) {
    for (let fx = -H; fx <= H; fx++) {
      const from = ((fy + Bh) % Bh) * Bw + ((fx + Bw) % Bw)
      const to = ((fy + LOW_SIDE) % LOW_SIDE) * LOW_SIDE + ((fx + LOW_SIDE) % LOW_SIDE)
      outRe[to] = re[from] * scale
      outIm[to] = im[from] * scale
    }
  }
  fft2(outRe, outIm, LOW_SIDE, LOW_SIDE, true)
  return [outRe, outIm]
}

/** How much the cell's chromaticity varies, weighted by brightness so near-black texels don't add noise. Colours must not be negative. */
function chromaSpread([c0, c1, c2]: Float64Array[]): number {
  const P = c0.length
  let wsum = 0
  let mr = 0
  let mg = 0
  for (let k = 0; k < P; k++) {
    const light = 0.299 * c0[k] + 0.587 * c1[k] + 0.114 * c2[k]
    const sum = c0[k] + c1[k] + c2[k] + 1e-6
    wsum += light
    mr += (light * c0[k]) / sum
    mg += (light * c1[k]) / sum
  }
  mr /= Math.max(1e-6, wsum)
  mg /= Math.max(1e-6, wsum)
  let vr = 0
  for (let k = 0; k < P; k++) {
    const light = 0.299 * c0[k] + 0.587 * c1[k] + 0.114 * c2[k]
    const sum = c0[k] + c1[k] + c2[k] + 1e-6
    vr += light * ((c0[k] / sum - mr) ** 2 + (c1[k] / sum - mg) ** 2)
  }
  return Math.sqrt(vr / Math.max(1e-6, wsum))
}

/** Light can't be negative, but Catmull-Rom (and a cut-off transform) can undershoot just below zero beside a sharp edge. */
function nonNegative(channel: Float64Array) {
  const out = new Float64Array(channel.length)
  for (let k = 0; k < channel.length; k++) out[k] = channel[k] > 0 ? channel[k] : 0
  return out
}

/**
 * Whether a folded Bw x Bh cell is soft folds or creases rather than a
 * pattern. Folds only change brightness, so the colour's chromaticity stays
 * put, and they're smooth, so nearly all their variation is in the
 * fundamental. A woven or printed pattern changes colour, or has edges, or
 * both. Both are judged on the cell's first few harmonics, so the noise of
 * the photo doesn't pass for colour.
 */
function looksLikeShading(channels: Float64Array[], Bw: number, Bh: number): boolean {
  const P = Bw * Bh
  const [red, green, blue] = channels.map(nonNegative)
  const light = new Float64Array(P)
  for (let k = 0; k < P; k++) light[k] = 0.299 * red[k] + 0.587 * green[k] + 0.114 * blue[k]
  // Two real signals to each complex transform: from here the four arrays
  // hold red + i green, and blue + i lightness, transformed.
  fft2(red, green, Bw, Bh, false)
  fft2(blue, light, Bw, Bh, false)
  const chroma = chromaSpread([...lowHarmonicsOf(red, green, Bw, Bh), lowHarmonicsOf(blue, light, Bw, Bh)[0]].map(nonNegative))
  // The fundamental's share of the first few harmonics: about 0.9 for a
  // square wave, nearly 1 for a smooth fold. Noise adds about the same to
  // every harmonic, which would make shallow folds look less smooth than
  // they are, so the typical level of the next few harmonics out (a median,
  // which a pattern's few strong ones there don't move) is taken off each.
  const H = LATTICE.shadingHarmonics
  let low = 0
  let lowCount = 0
  let fundamental = 0
  let fundamentalCount = 0
  const beyond: number[] = []
  const bin = (fx: number, fy: number) => ((fy + Bh) % Bh) * Bw + ((fx + Bw) % Bw)
  for (let fy = Math.max(-2 * H, 1 - Bh / 2); fy <= Math.min(2 * H, Bh / 2); fy++) {
    for (let fx = Math.max(-2 * H, 1 - Bw / 2); fx <= Math.min(2 * H, Bw / 2); fx++) {
      // The mean doesn't count, only how the lightness varies.
      if (!fx && !fy) continue
      // Lightness's own power, unpacked from blue + i lightness: |T(f) - conj T(-f)|^2 / 4.
      const k = bin(fx, fy)
      const mirror = bin(-fx, -fy)
      const e = ((blue[k] - blue[mirror]) ** 2 + (light[k] + light[mirror]) ** 2) / 4
      if (Math.abs(fx) <= H && Math.abs(fy) <= H) {
        low += e
        lowCount++
        if (Math.abs(fx) <= 1 && Math.abs(fy) <= 1) {
          fundamental += e
          fundamentalCount++
        }
      } else beyond.push(e)
    }
  }
  beyond.sort((a, b) => a - b)
  // A harmonic's power from noise alone is spread exponentially, whose median is ln 2 of its mean.
  const noise = beyond.length ? beyond[beyond.length >> 1] / Math.LN2 : 0
  const signal = low - lowCount * noise
  const share = signal > 0 ? Math.min(1, Math.max(0, fundamental - fundamentalCount * noise) / signal) : 1
  return chroma < LATTICE.shadingChroma && share > LATTICE.shadingShare
}

/**
 * Makes each w x h channel wrap seamlessly by taking off its smooth
 * component: the part its opposite edges disagree by (Moisan's periodic plus
 * smooth decomposition), solved two channels to a complex transform.
 */
function removeSmoothPart(channels: Float64Array[], w: number, h: number) {
  /** The jumps across the channel's wrapped edges, which the smooth component accounts for. */
  const boundary = (channel: Float64Array) => {
    const jumps = new Float64Array(w * h)
    for (let y = 0; y < h; y++) {
      const d = channel[y * w + w - 1] - channel[y * w]
      jumps[y * w] += d
      jumps[y * w + w - 1] -= d
    }
    for (let x = 0; x < w; x++) {
      const d = channel[(h - 1) * w + x] - channel[x]
      jumps[x] += d
      jumps[(h - 1) * w + x] -= d
    }
    return jumps
  }
  for (let c = 0; c < channels.length; c += 2) {
    const re = boundary(channels[c])
    const im = c + 1 < channels.length ? boundary(channels[c + 1]) : new Float64Array(w * h)
    fft2(re, im, w, h, false)
    for (let ky = 0; ky < h; ky++) {
      const cy = 2 * Math.cos((2 * Math.PI * ky) / h)
      for (let kx = 0; kx < w; kx++) {
        const k = ky * w + kx
        if (k === 0) {
          re[k] = 0
          im[k] = 0
          continue
        }
        const den = 2 * Math.cos((2 * Math.PI * kx) / w) + cy - 4
        re[k] /= den
        im[k] /= den
      }
    }
    fft2(re, im, w, h, true)
    for (let i = 0; i < w * h; i++) {
      channels[c][i] -= re[i]
      if (c + 1 < channels.length) channels[c + 1][i] -= im[i]
    }
  }
}

/** Standard deviation of a list of numbers. */
function standardDeviation(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length))
}

/**
 * Whether the plain sample is much plainer than the tile, showing the tile
 * came from something else, such as a placket or a print beside plain cloth.
 */
function sampleIsPlainer({ image, solid, swatch }: Source, srgb: Float32Array[]): boolean {
  const sample: number[] = []
  for (let y = swatch.y; y < swatch.y + swatch.height; y++) {
    for (let x = swatch.x; x < swatch.x + swatch.width; x++) {
      const i = y * image.width + x
      if (solid[i]) sample.push(0.299 * image.data[i * 4] + 0.587 * image.data[i * 4 + 1] + 0.114 * image.data[i * 4 + 2])
    }
  }
  const tile: number[] = []
  for (let k = 0; k < srgb[0].length; k++) tile.push(0.299 * srgb[0][k] + 0.587 * srgb[1][k] + 0.114 * srgb[2][k])
  return standardDeviation(sample) / Math.max(1e-6, standardDeviation(tile)) < LATTICE.plainShare
}

/** A width x height tile of the Bw x Bh base cell, in sRGB, repeated across and down. */
function repeatCell(srgb: Float32Array[], Bw: number, Bh: number, width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y % Bh) * Bw + (x % Bw)
      const o = (y * width + x) * 4
      data[o] = srgb[0][k]
      data[o + 1] = srgb[1][k]
      data[o + 2] = srgb[2][k]
      data[o + 3] = 255
    }
  }
  return { data, width, height }
}

/**
 * Checks a candidate lattice at full resolution and, if it holds up, folds
 * it into a tile. Null when a check fails: the repeats can't be sharpened,
 * too few cells line up, the lattice explains too little of the window,
 * part of the cell is on no repeat, the
 * fold washes the pattern out, or the "pattern" is folds or came from beside
 * plain cloth. A grid that turns out to be stripes read at a slant is tried
 * again as stripes.
 */
function verify(source: Source, found: Found, detectWin: Rect, scale: number, asStripes = false): FabricTile | null {
  const { image, solid, crop } = source
  // Fine repeats are folded over a larger area than they were found in.
  const win =
    detectWin.width >= LATTICE.minFold
      ? detectWin
      : squareIn(crop, detectWin.x + detectWin.width / 2, detectWin.y + detectWin.height / 2, LATTICE.minFold)

  // Work at full resolution in the window plus a margin of one cell.
  const stripes = found.kind === 'stripes'
  const vertical = found.across === 'u'
  const across = stripes ? (vertical ? found.u : found.v) : found.u
  const longest = Math.max(lengthOf(found.u), lengthOf(found.v), LATTICE.cellTarget)
  const margin = Math.ceil(longest * 0.6 + LATTICE.alignMax + 4)
  const rx = Math.max(0, win.x - margin)
  const ry = Math.max(0, win.y - margin)
  const region = regionOf(image, solid, {
    x: rx,
    y: ry,
    width: Math.min(image.width, win.x + win.width + margin) - rx,
    height: Math.min(image.height, win.y + win.height + margin) - ry,
  })
  const local: Rect = { x: win.x - rx, y: win.y - ry, width: win.width, height: win.height }
  // The light is measured over whole repeats, so the pattern itself doesn't sway it.
  const wholeRepeats = (period: number) => period * Math.max(1, Math.ceil(32 / period))
  if (stripes) {
    const spacing = wholeRepeats(lengthOf(across))
    flattenRegion(region, vertical ? spacing : LATTICE.cellTarget, vertical ? LATTICE.cellTarget : spacing, lengthOf(across))
  } else {
    const repeat = Math.min(lengthOf(found.u), lengthOf(found.v))
    flattenRegion(region, wholeRepeats(lengthOf(found.u)), wholeRepeats(lengthOf(found.v)), repeat)
  }

  const refined = refineLattice(region, local, found, scale)
  if (!refined) return null
  if (!stripes && !asStripes) {
    const angle = stripeDirection(region, local, refined.u, refined.v)
    if (angle !== null) {
      const lines = stripesAlong(region, local, angle, found.strength)
      return lines ? verify(source, lines, detectWin, scale, true) : null
    }
  }

  const lattice = alignCells(region, local, refined.u, refined.v, stripes, vertical)
  if (!lattice) return null
  const { cells, frame, ku, kv } = lattice
  const { U, V, origin } = frame
  const u = scaled(U, 1 / ku)
  const v = scaled(V, 1 / kv)
  const used = cells.filter((cell) => cell.weight > 0)
  const span = (key: 'i' | 'j') => new Set(used.map((cell) => cell[key])).size
  if (used.length < 3 || span('i') < 2 || (!stripes && span('j') < 2)) return null
  if (cells[0].weight === 0) return null
  if (toThousandths(leaveOneOutFit(cells, used)) < LATTICE.minFit) return null

  // Fold the best repeats into one base cell; grouped repeats are then laid
  // side by side again, exactly alike.
  const Bw = Math.max(16, Math.min(256, nextPow2(Math.round(0.75 * lengthOf(u)))))
  const Bh = Math.max(16, Math.min(256, nextPow2(Math.round(0.75 * lengthOf(v)))))
  const layers = repeatsToFold(region, [...used].sort((a, b) => b.match - a.match), lattice, Bw, Bh)
  if (!layers) return null
  const channels = foldRepeats(layers)
  if (keptSpread(layers, channels) < LATTICE.minKeep) return null
  const repeat = Math.min(lengthOf(u), stripes ? Infinity : lengthOf(v), stripes ? lengthOf(vertical ? u : v) : Infinity)
  if (repeat >= LATTICE.shadingRepeat && looksLikeShading(channels, Bw, Bh)) return null
  removeSmoothPart(channels, Bw, Bh)
  const srgb = channels.map((channel) => Float32Array.from(channel, toSrgb))
  if (sampleIsPlainer(source, srgb)) return null

  // Lay whole cells side by side until the tile is roughly square in the
  // photo, so its texture has about as many texels per metre both ways (a
  // long thin tile stretched onto a square texture is blurred by the GPU's
  // choice of mipmap).
  const copies = (a: number, b: number) => Math.max(1, Math.min(16, Math.round(a / b)))
  const ru = lengthOf(V) > lengthOf(U) ? copies(lengthOf(V), lengthOf(U)) : 1
  const rv = lengthOf(U) > lengthOf(V) ? copies(lengthOf(U), lengthOf(V)) : 1
  return {
    pixels: repeatCell(srgb, Bw, Bh, Bw * ku * ru, Bh * kv * rv),
    width: lengthOf(U) * ru,
    height: lengthOf(V) * rv,
    wrap: 'repeat',
    placement: { origin: [origin[0] + rx, origin[1] + ry], u: scaled(U, ru), v: scaled(V, rv) },
    ...(stripes ? { stripes: lengthOf(vertical ? u : v) } : {}),
  }
}
