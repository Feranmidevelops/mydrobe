/*
 * Radix-2 fast Fourier transforms, used by the pattern tile to find a
 * fabric's repeat and to make its tile wrap seamlessly. Every length must be
 * a power of two; nextPow2 gives the size to pad to.
 */

interface Plan {
  cos: Float64Array
  sin: Float64Array
  /** Each index with its bits reversed: the order the butterflies read their input in. */
  reversed: Uint32Array
}

/** Twiddle factors and bit-reversal order, worked out once for each length. */
const plans = new Map<number, Plan>()

function planFor(n: number): Plan {
  let plan = plans.get(n)
  if (!plan) {
    const cos = new Float64Array(n / 2)
    const sin = new Float64Array(n / 2)
    for (let k = 0; k < n / 2; k++) {
      cos[k] = Math.cos((2 * Math.PI * k) / n)
      sin[k] = Math.sin((2 * Math.PI * k) / n)
    }
    const reversed = new Uint32Array(n)
    const bits = Math.round(Math.log2(n))
    for (let i = 0; i < n; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      reversed[i] = r
    }
    plan = { cos, sin, reversed }
    plans.set(n, plan)
  }
  return plan
}

/**
 * Transforms one complex row in place. The inverse leaves out the 1/n
 * scaling, which fft2 applies once for the whole image.
 */
function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length
  if (n <= 1) return
  const { cos, sin, reversed } = planFor(n)
  for (let i = 0; i < n; i++) {
    const j = reversed[i]
    if (j > i) {
      let t = re[i]
      re[i] = re[j]
      re[j] = t
      t = im[i]
      im[i] = im[j]
      im[j] = t
    }
  }
  const sign = inverse ? 1 : -1
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const wr = cos[t]
        const wi = sign * sin[t]
        const a = start + k
        const b = a + half
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
      }
    }
  }
}

/**
 * Transforms a `width` x `height` complex image in place, rows then columns.
 * The inverse includes the 1 / (width x height) scaling, so a round trip
 * gives back the input. Going forward, `rows` says how many rows from the top
 * hold anything, so the all-zero padding below them isn't transformed.
 */
export function fft2(re: Float64Array, im: Float64Array, width: number, height: number, inverse: boolean, rows = height) {
  const rowRe = new Float64Array(width)
  const rowIm = new Float64Array(width)
  for (let y = 0; y < Math.min(rows, height); y++) {
    const o = y * width
    for (let x = 0; x < width; x++) {
      rowRe[x] = re[o + x]
      rowIm[x] = im[o + x]
    }
    fft(rowRe, rowIm, inverse)
    for (let x = 0; x < width; x++) {
      re[o + x] = rowRe[x]
      im[o + x] = rowIm[x]
    }
  }
  const columnRe = new Float64Array(height)
  const columnIm = new Float64Array(height)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      columnRe[y] = re[y * width + x]
      columnIm[y] = im[y * width + x]
    }
    fft(columnRe, columnIm, inverse)
    for (let y = 0; y < height; y++) {
      re[y * width + x] = columnRe[y]
      im[y * width + x] = columnIm[y]
    }
  }
  if (inverse) {
    const scale = 1 / (width * height)
    for (let i = 0; i < re.length; i++) {
      re[i] *= scale
      im[i] *= scale
    }
  }
}

/** The smallest power of two that is at least `n`. */
export function nextPow2(n: number) {
  let p = 1
  while (p < n) p <<= 1
  return p
}
