import { channelDistance, FOREIGN_COLOR, NECKLINE_DIP, type RgbaImage } from './photo-mapping'

/*
 * Finding a top's neckline on its front: the inner edge of the front's fabric
 * or collar, where what's seen through the neck opening (a hanger, a label,
 * the inside of the back, the backdrop) gives way to the front. Everything
 * seen through the opening lies above it, and everything below it is the
 * front's own, whatever its colour or shape: a collar, a logo, a button, a
 * placket, a print.
 *
 * The neckline is traced as an edge, not judged by its colours: a smooth line
 * dipping in the middle and rising up both sides, roughly mirror symmetric
 * about the garment's centre line, getting ever steeper as it goes out (a U, a
 * scoop, a square neck, or a V coming to a point at the top button). It runs
 * on the boundaries between pixels, scored by the colour steps across them,
 * measured between box means either side, so a soft edge two or three pixels
 * wide reads as one step across it. Where it can't be traced with confidence
 * there is no neckline, and the front is left to the colours alone.
 *
 * Of the outlines nested in the opening, the neckline is the outermost: a
 * hanger, the back's collar or a label hanging in the opening lie inside it.
 * But a rib or collar lining it, a band of the front no wider than the
 * neckline's dip that runs parallel all the way round, is the front's, and its
 * inner edge is the neckline. The line found is moved onto the boundary
 * itself, the first step out from the opening that stands out.
 */

export interface Neckline {
  /** Per column, the row the front starts at below the opening: everything above it in the span is seen through the opening. -1 outside the span. */
  rows: Int16Array
  /** The opening's first and last columns. */
  span: [number, number]
  /** The highest row, at the centre line, that the neckline's sides are still seen as an edge up to; it tilts with the neckline. */
  topRow: number
  /** How many rows per column the neckline is tilted by. */
  tilt: number
  /** The garment's centre line, in columns (half-way between two when the opening is an even number of columns wide). */
  axis: number
  /** The window's last row: the neckline lies above it, and nothing at it or below is seen through the opening. */
  window: number
}

/** The least step that counts as an edge, whatever the fabric, as a share of a colour that's "not the fabric". */
const EDGE_FLOOR = 0.4

/** How far an edge must stand out from the fabric's own steps (its weave, check or print): this many times their 90th percentile. */
const OVER_FABRIC = 1.25

/** The most a single unit of the neckline counts for, in edge thresholds, so one strong spot can't carry it. */
const STRONGEST = 3

/** How far off the front's middle the centre line may lie, as a share of the front's width. */
const CENTRE_REACH = 0.15

/** How far out from the centre line its mirror symmetry is measured, as a share of the front's width. */
const MIRROR_REACH = 0.2

/** The tilts tried, in rows per column, for a top hanging a few degrees off level. */
const TILTS = [-0.07, -0.035, 0, 0.035, 0.07]

/** Confidence: the share of the neckline's units that must be an edge on both sides. */
const SUPPORT = 0.75

/** Confidence: the longest stretch with no edge (a label hiding it), as a share of the front's width. */
const LONGEST_GAP = 0.06

/**
 * Confidence: the least width of the opening, as a share of the front's
 * width. A neck opening is a fifth of the front wide or more; a label hanging
 * into it, or a patch or print on the front, is narrower.
 */
const LEAST_WIDTH = 0.2

/** How far inside a neckline another must stay to be the inner edge of a rib or collar along it. */
const PEEL_GAP = 3

/** How much the inner edge's distance from the outer may spread (10th to 90th percentile), to run parallel all round. */
const PEEL_SPREAD = 5

/** How many rows or columns either way the traced neckline is moved onto the boundary nearby. */
const SNAP = 2

/**
 * The steepest rise held, in rows per four columns (a rise is measured over
 * the last four, so a straight line's staircase counts as one steady slope);
 * anything steeper, two rows a column or more, counts as running straight up.
 */
const STEEPEST = 8

/** Of all the centre lines and tilts tried, how many go on to the convex trace. */
const CONVEX_TRIES = 2

const NEG = -1e9
const FORBIDDEN = -1e6

/** The 3 x 3 box means of the front's first `rows` rows, one plane per channel; the edges average what's there. */
function boxMeans(front: RgbaImage, rows: number): Float32Array[] {
  const { width, data } = front
  const reach = Math.min(front.height, rows + 1)
  return [0, 1, 2].map((k) => {
    const across = new Float32Array(width * reach)
    for (let y = 0; y < reach; y++) {
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4 + k
        across[y * width + x] = (data[p] + (x > 0 ? data[p - 4] : 0) + (x < width - 1 ? data[p + 4] : 0)) / (1 + (x > 0 ? 1 : 0) + (x < width - 1 ? 1 : 0))
      }
    }
    const means = new Float32Array(width * rows)
    for (let y = 0; y < rows; y++) {
      const from = Math.max(0, y - 1)
      const to = Math.min(reach - 1, y + 1)
      for (let x = 0; x < width; x++) {
        let sum = 0
        for (let ny = from; ny <= to; ny++) sum += across[ny * width + x]
        means[y * width + x] = sum / (to - from + 1)
      }
    }
    return means
  })
}

/**
 * The colour steps across the pixel boundaries of rows `from` to `to` (less
 * one): `level[y]` across the boundary between rows y - 1 and y, `upright[y]`
 * across the boundary between columns x - 1 and x. Each compares the box
 * means centred two pixels either side, so a soft edge reads whole.
 */
function stepMaps(means: Float32Array[], width: number, rows: number, to: number) {
  const level = new Float32Array(width * to)
  const upright = new Float32Array(width * to)
  const [red, green, blue] = means
  const step = (i: number, j: number) => channelDistance(red[i], green[i], blue[i], red[j], green[j], blue[j])
  for (let y = 0; y < to; y++) {
    const above = Math.max(0, y - 2)
    const below = Math.min(rows - 1, y + 1)
    for (let x = 0; x < width; x++) {
      level[y * width + x] = step(above * width + x, below * width + x)
      upright[y * width + x] = step(y * width + Math.max(0, x - 2), y * width + Math.min(width - 1, x + 1))
    }
  }
  return { level, upright }
}

/** The `share` percentile of the steps across rows `from` to `to` (less one), away from the front's sides, read off a histogram. */
function stepPercentile(means: Float32Array[], width: number, rows: number, from: number, to: number, share: number) {
  const bins = new Uint32Array(4096)
  const [red, green, blue] = means
  const step = (i: number, j: number) => channelDistance(red[i], green[i], blue[i], red[j], green[j], blue[j])
  let count = 0
  // Every other row and column: a fair sample of the fabric's steps.
  for (let y = from + 2; y < to - 2; y += 2) {
    const above = Math.max(0, y - 2)
    const below = Math.min(rows - 1, y + 1)
    for (let x = 2; x < width - 2; x += 2) {
      bins[Math.min(4095, Math.floor(4 * step(above * width + x, below * width + x)))]++
      bins[Math.min(4095, Math.floor(4 * step(y * width + x - 2, y * width + x + 1)))]++
      count += 2
    }
  }
  if (count === 0) return 0
  let seen = 0
  for (let bin = 0; bin < bins.length; bin++) {
    seen += bins[bin]
    if (seen > share * count) return (bin + 0.5) / 4
  }
  return 1024
}

/** The step maps over the window, and what counts as an edge on them. */
interface Lattice {
  width: number
  /** The window's last row: the neckline lies above it. */
  last: number
  /** The shoulders' row: the neckline's sides reach up to it. A top turned a few degrees turns about it. */
  shoulders: number
  level: Float32Array
  upright: Float32Array
  edge: number
  strongest: number
}

/** A centre line, through a pixel (`left` = `right`) or between two, and a tilt in rows per column. */
interface Axis {
  left: number
  right: number
  tilt: number
}

/**
 * A neckline folded about its centre line: `ys[d]` is its row `d` columns out
 * from the centre on both sides (tilted), from its lowest point (d = 0) out to
 * where it ends (d = `end`), never falling again on the way.
 */
interface Path {
  score: number
  ys: Int16Array
  end: number
}

/** The convex trace's tables, reused between calls. */
interface ConvexTables {
  states: number
  score: Float32Array
  next: Float32Array
  back1: Int16Array
  back2: Int16Array
  back3: Int16Array
  next1: Int16Array
  next2: Int16Array
  next3: Int16Array
  back: Int32Array
  level: Float32Array
  rising: Float32Array
  steepScore: Float32Array
  steepFrom: Int32Array
}

let reused: ConvexTables | null = null

/** Tables for `states` states a column, and `size` back pointers in all; the same ones again when they're big enough. */
function convexTables(states: number, size: number): ConvexTables {
  if (reused && reused.states === states && reused.back.length >= size) return reused
  const rows = states / (STEEPEST + 1)
  reused = {
    states,
    score: new Float32Array(states),
    next: new Float32Array(states),
    back1: new Int16Array(states),
    back2: new Int16Array(states),
    back3: new Int16Array(states),
    next1: new Int16Array(states),
    next2: new Int16Array(states),
    next3: new Int16Array(states),
    back: new Int32Array(Math.max(size, reused?.back.length ?? 0)),
    level: new Float32Array(rows),
    rising: new Float32Array(rows + 1),
    steepScore: new Float32Array(rows + 1),
    steepFrom: new Int32Array(rows + 1),
  }
  return reused
}

/**
 * The step in `map` at column `x` of the folded frame and row `y`: a top
 * turned by `tilt` (rows per column) has its centre line turned too, so a row
 * further below the shoulders lies that much further across. 0 off the front
 * or the window.
 */
function stepAt(lattice: Lattice, map: Float32Array, x: number, y: number, tilt: number) {
  const column = x - Math.round(tilt * (y - lattice.shoulders))
  if (column < 0 || column >= lattice.width || y < 0 || y >= lattice.last) return 0
  return map[y * lattice.width + column]
}

/** How many rows the tilt moves the neckline at `d` columns out, the left side up and the right side down. */
function offsetAt({ left, right, tilt }: Axis, d: number) {
  return Math.round(tilt * (d + (right - left) / 2))
}

/**
 * The units at `d` columns out: `level[y]` for the neckline running level at
 * row y there, and `rising[y]` the running total of the units it climbs
 * through between d - 1 and d, up to row y. Each scores the weaker side's step
 * less the edge threshold, so a path is only as good as both its sides.
 */
function unitsAt(lattice: Lattice, axis: Axis, d: number, level: Float32Array, rising: Float32Array, forbid: Uint8Array | null) {
  const { last, edge, strongest } = lattice
  const levelSteps = lattice.level
  const uprightSteps = lattice.upright
  const off = offsetAt(axis, d)
  const xl = axis.left - d
  const xr = axis.right + d
  const rows = last + 1
  for (let y = 1; y < last; y++) {
    const yl = y - off
    const yr = y + off
    if (yl < 1 || yr < 1 || yl >= last || yr >= last) level[y] = -edge
    else {
      const a = stepAt(lattice, levelSteps, xl, yl, axis.tilt)
      const b = stepAt(lattice, levelSteps, xr, yr, axis.tilt)
      level[y] = (a < b ? (a < strongest ? a : strongest) : b < strongest ? b : strongest) - edge
    }
    if (forbid !== null && forbid[d * rows + y]) level[y] = FORBIDDEN
  }
  rising[0] = 0
  for (let y = 0; y < rows; y++) {
    let unit = 0
    if (d > 0 && y < last) {
      const yl = y - off
      const yr = y + off
      if (yl < 0 || yr < 0 || yl >= last || yr >= last) unit = -edge
      else {
        const a = stepAt(lattice, uprightSteps, xl + 1, yl, axis.tilt)
        const b = stepAt(lattice, uprightSteps, xr, yr, axis.tilt)
        unit = (a < b ? (a < strongest ? a : strongest) : b < strongest ? b : strongest) - edge
      }
      if (forbid !== null && forbid[d * rows + y]) unit = FORBIDDEN
    }
    rising[y + 1] = rising[y] + unit
  }
}

/** How far out from the centre line a path may run, and how far it must, to be wide enough. */
function reachOf(lattice: Lattice, { left, right }: Axis) {
  const most = Math.min(left, lattice.width - 1 - right) - 2
  const least = Math.max(1, Math.ceil((LEAST_WIDTH * lattice.width - (right - left + 1)) / 2))
  return { most, least }
}

/**
 * The best path about one centre line and tilt that only ever rises going
 * out, ending at or above the shoulders' row: a quick first look, before the
 * convex trace.
 */
function traceRising(lattice: Lattice, axis: Axis): Path | null {
  const { most, least } = reachOf(lattice, axis)
  if (most < 4) return null
  const rows = lattice.last + 1
  const best = new Float32Array((most + 1) * rows).fill(NEG)
  const from = new Int16Array((most + 1) * rows)
  const [level, rising] = [new Float32Array(rows), new Float32Array(rows + 1)]
  unitsAt(lattice, axis, 0, level, rising, null)
  for (let y = 1; y < lattice.last; y++) best[y] = level[y]
  let top = NEG
  let end = -1
  let endRow = -1
  for (let d = 0; d < most; d++) {
    unitsAt(lattice, axis, d + 1, level, rising, null)
    let run = NEG
    let arg = -1
    for (let y = lattice.last - 1; y >= 1; y--) {
      const candidate = best[d * rows + y] + rising[y]
      if (candidate > run) {
        run = candidate
        arg = y
      }
      if (run <= NEG / 2) continue
      best[(d + 1) * rows + y] = level[y] - rising[y] + run
      from[(d + 1) * rows + y] = arg
    }
    if (d + 1 < least) continue
    for (let y = 1; y <= lattice.shoulders && y < lattice.last; y++) {
      const score = best[(d + 1) * rows + y]
      if (score > top) {
        top = score
        end = d + 1
        endRow = y
      }
    }
  }
  if (end < 0) return null
  const ys = new Int16Array(end + 1)
  ys[end] = endRow
  for (let d = end; d > 0; d--) ys[d - 1] = from[d * rows + ys[d]]
  return { score: top, ys, end }
}

/**
 * The best convex path about one centre line and tilt: rising ever more
 * steeply going out, as a U, a scoop, a square neck and a V all do, so it
 * can't dip round something below the neckline and come back up to it. A
 * rise is measured over the last four columns, so the staircase of a straight
 * line, whose rises differ by a row from column to column, counts as one
 * steady slope, and a rise may fall short of the steepest so far by one row
 * of digitisation per four columns. A notch round a button, rising one row
 * a column and then running level again, falls short by more. Cells marked in
 * `forbid` (a column `d` out at a time) can't be used.
 */
function traceConvex(lattice: Lattice, axis: Axis, forbid: Uint8Array | null = null, most = reachOf(lattice, axis).most): Path | null {
  const { least } = reachOf(lattice, axis)
  if (most < 1) return null
  const { last, shoulders } = lattice
  const rows = last + 1
  const kinds = STEEPEST + 1
  const states = rows * kinds
  const work = convexTables(states, (most + 1) * states)
  let { score, next, back1, back2, back3, next1, next2, next3 } = work
  const { back, level, rising, steepScore, steepFrom } = work
  score.fill(NEG)
  unitsAt(lattice, axis, 0, level, rising, forbid)
  for (let y = 1; y < last; y++) {
    score[y * kinds] = level[y]
    back1[y * kinds] = back2[y * kinds] = back3[y * kinds] = y
  }
  let top = NEG
  let end = -1
  let endState = -1
  for (let d = 0; d < most; d++) {
    unitsAt(lattice, axis, d + 1, level, rising, forbid)
    next.fill(NEG)
    const at = (d + 1) * states
    // Climbing STEEPEST rows or more in one column: from any state at least that far below.
    steepScore[rows] = NEG
    steepFrom[rows] = -1
    for (let y = rows - 1; y >= 0; y--) {
      let bestHere = NEG
      let from = -1
      if (y >= 1 && y < last) {
        for (let m = 0; m < kinds; m++) {
          const value = score[y * kinds + m]
          if (value > bestHere) {
            bestHere = value
            from = y * kinds + m
          }
        }
      }
      const value = bestHere + rising[y]
      if (bestHere > NEG / 2 && value > steepScore[y + 1]) {
        steepScore[y] = value
        steepFrom[y] = from
      } else {
        steepScore[y] = steepScore[y + 1]
        steepFrom[y] = steepFrom[y + 1]
      }
    }
    for (let y2 = 1; y2 + STEEPEST < last; y2++) {
      const from = steepFrom[y2 + STEEPEST]
      if (from < 0) continue
      const value = steepScore[y2 + STEEPEST] - rising[y2] + level[y2]
      const state = y2 * kinds + STEEPEST
      if (value <= next[state]) continue
      next[state] = value
      back[at + state] = from
      next1[state] = Math.floor(from / kinds)
      next2[state] = back1[from]
      next3[state] = back2[from]
    }
    // Climbing less: the rise over the last four columns may fall short of the steepest so far by a row.
    for (let y = 1; y < last; y++) {
      // A state no better than one at the same row whose steepest is gentler and that stood as low four columns back
      // can do nothing that one can't: it's skipped.
      let gentlest = NEG
      let gentlestEarlier = -1
      for (let m = 0; m < kinds; m++) {
        const state = y * kinds + m
        const value = score[state]
        if (value <= NEG / 2) continue
        const earlier = back3[state]
        if (value <= gentlest && earlier <= gentlestEarlier) continue
        if (value > gentlest) {
          gentlest = value
          gentlestEarlier = earlier
        }
        const base = value + rising[y]
        const lowest = Math.max(0, m - 1 - (earlier - y))
        for (let k = lowest; k < STEEPEST && k < y; k++) {
          const y2 = y - k
          const rise = earlier - y2 < STEEPEST ? earlier - y2 : STEEPEST
          const to = y2 * kinds + (m > rise ? m : rise)
          // A climb of one row is the staircase of a sloping edge, and never counts against the path.
          const candidate = k === 1 ? value + Math.max(0, rising[y] - rising[y2]) + level[y2] : base - rising[y2] + level[y2]
          if (candidate <= next[to]) continue
          next[to] = candidate
          back[at + to] = state
          next1[to] = y
          next2[to] = back1[state]
          next3[to] = back2[state]
        }
      }
    }
    const swapScore = score
    score = next
    next = swapScore
    const swap1 = back1
    back1 = next1
    next1 = swap1
    const swap2 = back2
    back2 = next2
    next2 = swap2
    const swap3 = back3
    back3 = next3
    next3 = swap3
    if (d + 1 < least) continue
    for (let y = 1; y <= shoulders && y < last; y++) {
      for (let m = 0; m < kinds; m++) {
        const value = score[y * kinds + m]
        if (value > top) {
          top = value
          end = d + 1
          endState = y * kinds + m
        }
      }
    }
  }
  if (end < 0) return null
  const ys = new Int16Array(end + 1)
  let state = endState
  for (let d = end; d >= 0; d--) {
    ys[d] = Math.floor(state / kinds)
    if (d > 0) state = back[d * states + state]
  }
  return { score: top, ys, end }
}

/** Each unit of a path, walking out from its lowest point, level then climbing: the weaker side's step, and its row. */
function unitsOf(lattice: Lattice, axis: Axis, { ys, end }: Path) {
  const { last } = lattice
  const units: { step: number; row: number }[] = []
  for (let d = 0; d <= end; d++) {
    const off = offsetAt(axis, d)
    const [xl, xr] = [axis.left - d, axis.right + d]
    if (ys[d] < last) units.push({ step: Math.min(stepAt(lattice, lattice.level, xl, ys[d] - off, axis.tilt), stepAt(lattice, lattice.level, xr, ys[d] + off, axis.tilt)), row: ys[d] })
    if (d === 0) continue
    for (let y = ys[d]; y < Math.min(last, ys[d - 1]); y++) {
      const step = Math.min(stepAt(lattice, lattice.upright, xl + 1, y - off, axis.tilt), stepAt(lattice, lattice.upright, xr, y + off, axis.tilt))
      // A climb of one row is the staircase of a sloping edge, not a unit of its own unless it's an edge itself.
      if (ys[d - 1] - ys[d] === 1 && step < lattice.edge) continue
      units.push({ step, row: y })
    }
  }
  return units
}

/**
 * Where the path's sides stop being an edge on both sides, walking in from
 * its ends: the row, and how far out, of its outermost unit that is one. A
 * convex path can overshoot the top of a side that runs straight up; this
 * skips the overshoot.
 */
function highestEdge(lattice: Lattice, axis: Axis, { ys, end }: Path) {
  const { last, edge } = lattice
  for (let d = end; d >= 0; d--) {
    const off = offsetAt(axis, d)
    const [xl, xr] = [axis.left - d, axis.right + d]
    if (d > 0) {
      for (let y = ys[d]; y < Math.min(last, ys[d - 1]); y++) {
        if (Math.min(stepAt(lattice, lattice.upright, xl + 1, y - off, axis.tilt), stepAt(lattice, lattice.upright, xr, y + off, axis.tilt)) >= edge) return { row: y, d: d - 1 }
      }
    }
    if (ys[d] < last && Math.min(stepAt(lattice, lattice.level, xl, ys[d] - off, axis.tilt), stepAt(lattice, lattice.level, xr, ys[d] + off, axis.tilt)) >= edge) return { row: ys[d], d }
  }
  return { row: last, d: 0 }
}

/** Drops the unsupported top of a path's last climb, so it ends where the edge does. */
function trimmed(lattice: Lattice, axis: Axis, path: Path): Path {
  const { ys, end } = path
  if (end < 1) return path
  const { last, edge } = lattice
  const off = offsetAt(axis, end)
  const supported = (y: number) => {
    const [a, b] = [y - off, y + off]
    if (a < 0 || b < 0 || a >= last || b >= last) return false
    return Math.min(stepAt(lattice, lattice.upright, axis.left - end + 1, a, axis.tilt), stepAt(lattice, lattice.upright, axis.right + end, b, axis.tilt)) >= edge
  }
  let y = ys[end]
  while (y < ys[end - 1] - 1 && !supported(y)) y++
  if (y === ys[end]) return path
  const copy = ys.slice()
  copy[end] = y
  return { ...path, ys: copy }
}

/** Whether a path is a neckline found with confidence (see the module's notes), and how high its sides reach. */
function judged(lattice: Lattice, axis: Axis, path: Path, dip: number, least = LEAST_WIDTH) {
  const units = unitsOf(lattice, axis, path)
  let [supported, gap, longest] = [0, 0, 0]
  // The sides must rise through the shoulders' row, and be seen as an edge there, not just reach it.
  let [through, throughSupported] = [0, 0]
  for (const { step, row } of units) {
    const edge = step >= lattice.edge
    if (edge) {
      supported++
      gap = 0
    } else longest = Math.max(longest, ++gap)
    if (Math.abs(row - lattice.shoulders) > SNAP) continue
    through++
    if (edge) throughSupported++
  }
  const reach = highestEdge(lattice, axis, path)
  const width = axis.right - axis.left + 2 * reach.d + 1
  const ok =
    supported >= SUPPORT * Math.max(1, units.length) &&
    longest <= Math.max(2, Math.round(LONGEST_GAP * lattice.width)) &&
    width >= least * lattice.width &&
    path.ys[0] - path.ys[path.end] >= Math.max(2, Math.round(dip / 2)) &&
    reach.row <= lattice.shoulders &&
    through > 0 &&
    2 * throughSupported >= through &&
    path.score > 0
  return { ok, reach }
}

/** A folded path's points: each level unit's, and each row of its climbs. */
function pointsOf({ ys, end }: Path) {
  const points: [number, number][] = []
  for (let d = 0; d <= end; d++) {
    points.push([d, ys[d]])
    if (d > 0) for (let y = ys[d] + 1; y < ys[d - 1]; y++) points.push([d - 0.5, y])
  }
  return points
}

/**
 * The cells of the folded window, `columns` out from the centre line, that a
 * path inside `path` (or outside it, `outward`) may not use: those on the
 * path's other side, and those within PEEL_GAP of it (across or diagonally).
 */
function besides(lattice: Lattice, path: Path, columns: number, outward: boolean, widest = Infinity) {
  const rows = lattice.last + 1
  const cells = columns * rows
  const far = Math.min(widest + 1, 32000)
  const apart = new Int16Array(cells).fill(far)
  const queue = new Int32Array(cells)
  let tail = 0
  const seed = (d: number, y: number) => {
    if (y < 0 || y >= rows || apart[d * rows + y] === 0) return
    apart[d * rows + y] = 0
    queue[tail++] = d * rows + y
  }
  for (let d = 0; d <= path.end; d++) {
    seed(d, path.ys[d])
    if (d === 0) continue
    for (let y = path.ys[d]; y < path.ys[d - 1]; y++) {
      seed(d, y)
      seed(d - 1, y)
    }
  }
  for (let head = 0; head < tail; head++) {
    const cell = queue[head]
    const [d, y] = [Math.floor(cell / rows), cell % rows]
    if (apart[cell] >= far - 1) continue
    for (let nd = Math.max(0, d - 1); nd <= Math.min(columns - 1, d + 1); nd++) {
      for (let ny = Math.max(0, y - 1); ny <= Math.min(rows - 1, y + 1); ny++) {
        const next = nd * rows + ny
        if (apart[next] <= apart[cell] + 1) continue
        apart[next] = apart[cell] + 1
        queue[tail++] = next
      }
    }
  }
  const forbid = new Uint8Array(cells)
  for (let d = 0; d < columns; d++) {
    for (let y = 0; y < rows; y++) {
      const cell = d * rows + y
      const inside = d <= path.end && y < path.ys[d]
      if (apart[cell] < PEEL_GAP || apart[cell] > widest || (outward ? inside || (d <= path.end && y === path.ys[d]) : !inside)) forbid[cell] = 1
    }
  }
  return forbid
}

/**
 * The front's neckline when what was traced is something seen through the
 * opening, lying across it or hanging in it, like a hanger, the back's collar
 * or a label: a confident path at least PEEL_GAP outside it, below it, or
 * null. The front's neckline is the outermost of the opening's outlines.
 */
function outerEdge(lattice: Lattice, axis: Axis, inner: Path, dip: number) {
  const { most } = reachOf(lattice, axis)
  const found = traceConvex(lattice, axis, besides(lattice, inner, most + 1, true))
  if (!found) return null
  const outer = trimmed(lattice, axis, found)
  const verdict = judged(lattice, axis, outer, dip)
  return verdict.ok ? { path: outer, verdict } : null
}

/**
 * The inner edge of a rib or collar lining `outer`: a confident path at least
 * PEEL_GAP inside it, running parallel all the way round (every point about as
 * far from the outer path), or null. One that shares the outer path's sides
 * is something lying across the opening, like a hanger bar, not a rib.
 */
function innerEdge(lattice: Lattice, axis: Axis, outer: Path, dip: number) {
  const forbid = besides(lattice, outer, outer.end + 1, false, dip)
  const outerPoints = pointsOf(outer)
  const found = traceConvex(lattice, axis, forbid, outer.end)
  if (!found) return null
  const inner = trimmed(lattice, axis, found)
  // The opening is as wide as its outline: the rib narrows it by its own width.
  const verdict = judged(lattice, axis, inner, dip, 0)
  if (!verdict.ok) return null
  const distances = pointsOf(inner)
    .map(([d, y]) => Math.min(...outerPoints.map(([e, z]) => Math.hypot(d - e, y - z))))
    .sort((a, b) => a - b)
  const middle = distances[distances.length >> 1]
  const spread = distances[Math.floor(distances.length * 0.9)] - distances[Math.floor(distances.length * 0.1)]
  if (middle < 1 || spread > PEEL_SPREAD) return null
  return { path: inner, verdict }
}

/**
 * The centre lines near the front's middle, with the tilts, about which the
 * window's steps mirror best, best first: the three best of those that mirror
 * better than their neighbours. A centre line is given doubled, as 2x (odd
 * between two columns); a turned top's steps mirror about a turned line.
 */
function centreLines(lattice: Lattice) {
  const { width, last, shoulders, level, upright } = lattice
  const reach = Math.round(MIRROR_REACH * width)
  const [from, to] = [Math.round(width - 2 * CENTRE_REACH * width), Math.round(width + 2 * CENTRE_REACH * width)]
  const read = (map: Float32Array, x: number, y: number, tilt: number) => {
    const column = x - Math.round(tilt * (y - shoulders))
    return y < 0 || y >= last || column < 0 || column >= width ? 0 : map[y * width + column]
  }
  const symmetry = (twice: number, tilt: number) => {
    let both = 0
    let either = 0
    const pair = (a: number, b: number) => {
      both += a < b ? a : b
      either += a < b ? b : a
    }
    // Every other row. Level steps are a pixel's own: mirror x to twice - x. Upright ones sit between x - 1 and x.
    for (let y = 0; y < last; y += 2) {
      for (let k = 1; k <= reach; k++) {
        const off = Math.round((tilt * (2 * k)) / 2)
        const x = Math.floor((twice - 2 * k) / 2)
        pair(read(level, x, y - off, tilt), read(level, twice - x, y + off, tilt))
        pair(read(upright, x + 1, y - off, tilt), read(upright, twice - x, y + off, tilt))
      }
    }
    return either ? both / either : 0
  }
  // Every two columns first, then every half column round the best of those.
  const scores = new Map<string, { twice: number; tilt: number; score: number }>()
  const scored = (twice: number, tilt: number) => {
    if (twice < from || twice > to) return -1
    const key = `${twice}:${tilt}`
    if (!scores.has(key)) scores.set(key, { twice, tilt, score: symmetry(twice, tilt) })
    return scores.get(key)?.score ?? -1
  }
  const coarse: { twice: number; tilt: number; score: number }[] = []
  for (let twice = from; twice <= to; twice += 4) for (const tilt of TILTS) coarse.push({ twice, tilt, score: scored(twice, tilt) })
  const peaks = (list: { twice: number; tilt: number; score: number }[], step: number) =>
    list
      .filter(({ twice, tilt, score }) => score >= scored(twice - step, tilt) && score >= scored(twice + step, tilt))
      .sort((a, b) => b.score - a.score)
  for (const { twice, tilt } of peaks(coarse, 4).slice(0, 3)) for (let fine = twice - 3; fine <= twice + 3; fine++) scored(fine, tilt)
  const fine = [...scores.values()].filter(({ twice, tilt }) => scores.has(`${twice - 1}:${tilt}`) && scores.has(`${twice + 1}:${tilt}`))
  return peaks(fine, 1).slice(0, 3)
}
const axisOf = (twice: number, tilt: number): Axis => ({ left: Math.floor(twice / 2), right: Math.ceil(twice / 2), tilt })

/**
 * Unfolds a path about its centre line, turned as the top is, to the row the
 * front starts at in each column, and the first and last columns it spans.
 */
function unfolded(lattice: Lattice, axis: Axis, { ys, end }: Path) {
  const { width, last, shoulders } = lattice
  const rows = new Int16Array(width).fill(-1)
  // Everything above the path is the opening: each of its cells lands on a pixel, and a column's lowest is the line.
  for (let d = 0; d <= end; d++) {
    const off = offsetAt(axis, d)
    for (const [x0, sign] of [
      [axis.left - d, -1],
      [axis.right + d, 1],
    ]) {
      for (let row = 0; row < ys[d]; row++) {
        const y = row + sign * off
        const x = x0 - Math.round(axis.tilt * (y - shoulders))
        if (y < 0 || y >= last || x < 0 || x >= width) continue
        rows[x] = Math.max(rows[x], y + 1)
      }
    }
  }
  let [left, right] = [width, -1]
  for (let x = 0; x < width; x++) {
    if (rows[x] < 0) continue
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  for (let x = left + 1; x < right; x++) if (rows[x] < 0) rows[x] = Math.min(rows[x - 1], rows[x + 1] < 0 ? last : rows[x + 1])
  return { rows, span: [left, right] as [number, number] }
}

/** The colour step between two pixels of the front, as photographed. */
function rawStep(front: RgbaImage, i: number, j: number) {
  const { data } = front
  return channelDistance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[j * 4], data[j * 4 + 1], data[j * 4 + 2])
}

/**
 * Of the steps between neighbouring pixels `step(k)` for k from `from` to
 * `to`, ordered from the opening outward: the first that stands out, an edge
 * (at least `edge`) and at least half as sharp as the sharpest. The first
 * such step out from the opening is the neckline; a sharper one a pixel or
 * two further out is something on the front lining it, like a collar's shaded
 * rim, and what's left of the opening's soft edge above that is taken with
 * the soft edge (see coverNeckOpening). A weaker step nearer the opening, like
 * the blocks of a JPEG or the shading on a hanger, isn't.
 */
function firstEdge(from: number, to: number, edge: number, step: (k: number) => number) {
  const steps = Array.from({ length: to - from + 1 }, (_, k) => step(from + k))
  const sharpest = Math.max(...steps)
  const first = steps.findIndex((value) => value >= Math.max(edge, sharpest / 2))
  return from + (first >= 0 ? first : steps.indexOf(sharpest))
}

/**
 * Moves the neckline onto the boundary itself: the traced line can't tell
 * rows (or columns) apart along a strong soft edge, where every unit counts
 * its most. Level stretches go to the first edge between two pixels within
 * SNAP rows, from the opening down, and each row of a climb (a step of two
 * rows or more between neighbouring columns, on either side) to the first
 * within SNAP columns, from the opening out (see firstEdge).
 */
function snapped(front: RgbaImage, rows: Int16Array, [left, right]: [number, number], last: number, edge: number) {
  const { width } = front
  const level = rows.slice()
  for (let x = left + 1; x < right; x++) {
    const n = rows[x]
    if (Math.abs(rows[x + 1] - rows[x - 1]) > 2 || n >= last) continue
    level[x] = firstEdge(Math.max(1, n - SNAP), Math.min(last - 1, n + SNAP), edge, (y) => rawStep(front, (y - 1) * width + x, y * width + x))
  }
  // The opening as a mask over the window, its climbs' rows moved across, then read back a column at a time.
  const open = new Uint8Array(width * last)
  for (let x = left; x <= right; x++) for (let y = 0; y < Math.min(level[x], last); y++) open[y * width + x] = 1
  for (let x = left; x < right; x++) {
    if (Math.abs(level[x] - level[x + 1]) < 2) continue
    // From the column the opening reaches lower in, out towards the other.
    const [inside, out] = level[x] > level[x + 1] ? [x, 1] : [x + 1, -1]
    for (let y = Math.min(level[x], level[x + 1]); y < Math.max(level[x], level[x + 1]) && y < last; y++) {
      // The boundary after the opening's j-th pixel out from `inside` (0: between it and the next).
      const column = (j: number) => inside + j * out
      const step = (j: number) => {
        const [a, b] = [column(j), column(j + 1)]
        return a < 0 || b < 0 || a >= width || b >= width ? 0 : rawStep(front, y * width + a, y * width + b)
      }
      const moved = firstEdge(-SNAP, SNAP, edge, step)
      for (let j = Math.min(0, moved) + 1; j <= Math.max(0, moved); j++) {
        const at = column(j)
        if (at >= left && at <= right) open[y * width + at] = moved > 0 ? 1 : 0
      }
    }
  }
  const out = new Int16Array(rows.length).fill(-1)
  for (let x = left; x <= right; x++) {
    out[x] = 0
    for (let y = last - 1; y >= 0; y--) {
      if (!open[y * width + x]) continue
      out[x] = y + 1
      break
    }
  }
  return out
}

/**
 * The neckline on `front`, whose neck opening shows in its first `band` rows
 * and the neckline's dip below them; or null when it can't be traced with
 * confidence.
 */
export function findNeckline(front: RgbaImage, band: number): Neckline | null {
  const { width, height } = front
  const dip = Math.max(1, Math.round(height * NECKLINE_DIP))
  const last = Math.min(height - 1, band + dip)
  const shoulders = band - dip
  if (last < 4 || shoulders < 1 || band < 5) return null
  // The fabric's own steps, from a stretch of the front below the window.
  const [fabricFrom, fabricTo] = [last + 2, Math.min(height, last + 2 + Math.round(height * 0.25))]
  const meanRows = Math.min(height, Math.max(last + 3, fabricTo))
  const means = boxMeans(front, meanRows)
  const { level, upright } = stepMaps(means, width, meanRows, last + 1)
  const edge = Math.max(EDGE_FLOOR * FOREIGN_COLOR, OVER_FABRIC * stepPercentile(means, width, meanRows, fabricFrom, fabricTo, 0.9))
  const lattice: Lattice = { width, last, shoulders, level, upright, edge, strongest: STRONGEST * edge }

  // A quick look along the best centre lines and tilts, then a finer one round the best of them.
  const tried = new Map<string, { twice: number; tilt: number; score: number }>()
  const tryAxis = (twice: number, tilt: number) => {
    const key = `${twice}:${tilt}`
    if (tried.has(key)) return
    const path = traceRising(lattice, axisOf(twice, tilt))
    tried.set(key, { twice, tilt, score: path ? path.score : NEG })
  }
  for (const { twice } of centreLines(lattice)) for (const tilt of TILTS) tryAxis(twice, tilt)
  const ranked = () => [...tried.values()].filter(({ score }) => score > NEG / 2).sort((a, b) => b.score - a.score)
  const first = ranked()[0]
  if (!first) return null
  // Finer: the centre line in half columns within a column and a half, then the tilts half-way between.
  for (let twice = first.twice - 3; twice <= first.twice + 3; twice++) tryAxis(twice, first.tilt)
  const finer = ranked()[0]
  const halfTilt = (TILTS[1] - TILTS[0]) / 2
  for (const tilt of [finer.tilt - halfTilt, finer.tilt + halfTilt]) tryAxis(finer.twice, tilt)
  let best: { axis: Axis; path: Path } | null = null
  for (const { twice, tilt } of ranked().slice(0, CONVEX_TRIES)) {
    const axis = axisOf(twice, tilt)
    const path = traceConvex(lattice, axis)
    if (path && (!best || path.score > best.path.score)) best = { axis, path }
  }
  if (!best) return null
  const { axis } = best
  let path = trimmed(lattice, axis, best.path)
  let verdict = judged(lattice, axis, path, dip)
  if (!verdict.ok) return null
  // Something seen through the opening lies inside the front's neckline: the neckline is the outermost outline.
  for (let outer = outerEdge(lattice, axis, path, dip); outer; outer = outerEdge(lattice, axis, path, dip)) {
    ;({ path, verdict } = outer)
  }
  // A rib or collar lining the neckline is the front's: its inner edge is the neckline.
  for (let inner = innerEdge(lattice, axis, path, dip); inner; inner = innerEdge(lattice, axis, path, dip)) {
    ;({ path, verdict } = inner)
  }
  const { rows: drawn, span } = unfolded(lattice, axis, path)
  if (span[1] < span[0]) return null
  const rows = snapped(front, drawn, span, last, edge)
  return { rows, span, topRow: verdict.reach.row, tilt: axis.tilt, axis: (axis.left + axis.right) / 2, window: last }
}
