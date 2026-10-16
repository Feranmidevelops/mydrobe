import type { FabricPattern } from '../features/garments/garment.types'

/** Small deterministic PRNG so generated fabric looks the same on every draw. */
export function seededRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function speckle(
  ctx: CanvasRenderingContext2D,
  widthMm: number,
  heightMm: number,
  options: { mm2PerSpeck: number; size: [number, number]; alpha: number; streak?: number },
) {
  const random = seededRandom(Math.round(widthMm * 31 + heightMm * 17))
  const count = Math.round((widthMm * heightMm) / options.mm2PerSpeck)
  const [minSize, maxSize] = options.size
  for (let i = 0; i < count; i++) {
    const light = random() > 0.5
    ctx.fillStyle = light ? `rgba(255,255,255,${options.alpha})` : `rgba(0,0,0,${options.alpha})`
    const size = minSize + random() * (maxSize - minSize)
    const length = options.streak ? size * options.streak : size
    ctx.fillRect(random() * widthMm, random() * heightMm, length, size)
  }
}

const DENIM_STEP_MM = 1.1
const TWILL_STEP_MM = 0.9

function diagonalLines(
  ctx: CanvasRenderingContext2D,
  widthMm: number,
  heightMm: number,
  options: { stepMm: number; lineMm: number; color: string },
) {
  // Twill weaves read as fine lines rising to the right at roughly 63°.
  const rise = 2
  ctx.strokeStyle = options.color
  ctx.lineWidth = options.lineMm
  ctx.beginPath()
  for (let x = -heightMm / rise; x < widthMm; x += options.stepMm) {
    ctx.moveTo(x, heightMm)
    ctx.lineTo(x + heightMm / rise, 0)
  }
  ctx.stroke()
}

/**
 * Fills a widthMm × heightMm area with the fabric. The caller sets the canvas
 * transform so that one unit is one millimetre of fabric.
 */
export function drawFabric(
  ctx: CanvasRenderingContext2D,
  fabric: FabricPattern,
  widthMm: number,
  heightMm: number,
) {
  switch (fabric.kind) {
    case 'solid': {
      ctx.fillStyle = fabric.color
      ctx.fillRect(0, 0, widthMm, heightMm)
      if (fabric.finish === 'slub') {
        speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 30, size: [0.3, 0.7], alpha: 0.07, streak: 14 })
      } else if (fabric.finish === 'wool') {
        speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 6, size: [0.3, 0.8], alpha: 0.08 })
      } else {
        speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 20, size: [0.3, 0.6], alpha: 0.04 })
      }
      return
    }
    case 'stripes': {
      ctx.fillStyle = fabric.base
      ctx.fillRect(0, 0, widthMm, heightMm)
      ctx.fillStyle = fabric.stripe
      for (let x = 0; x < widthMm; x += fabric.periodMm) {
        ctx.fillRect(x, 0, fabric.stripeMm, heightMm)
      }
      speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 18, size: [0.3, 0.6], alpha: 0.05 })
      return
    }
    case 'check': {
      const band = fabric.periodMm / 2
      ctx.fillStyle = fabric.base
      ctx.fillRect(0, 0, widthMm, heightMm)
      ctx.fillStyle = fabric.line
      ctx.globalAlpha = 0.5
      for (let x = 0; x < widthMm; x += fabric.periodMm) ctx.fillRect(x, 0, band, heightMm)
      for (let y = 0; y < heightMm; y += fabric.periodMm) ctx.fillRect(0, y, widthMm, band)
      ctx.globalAlpha = 1
      speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 18, size: [0.3, 0.6], alpha: 0.05 })
      return
    }
    case 'denim': {
      ctx.fillStyle = fabric.color
      ctx.fillRect(0, 0, widthMm, heightMm)
      diagonalLines(ctx, widthMm, heightMm, {
        stepMm: DENIM_STEP_MM,
        lineMm: 0.4,
        color: 'rgba(255,255,255,0.13)',
      })
      speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 14, size: [0.25, 0.5], alpha: 0.12, streak: 8 })
      return
    }
    case 'twill': {
      ctx.fillStyle = fabric.color
      ctx.fillRect(0, 0, widthMm, heightMm)
      diagonalLines(ctx, widthMm, heightMm, {
        stepMm: TWILL_STEP_MM,
        lineMm: 0.35,
        color: 'rgba(0,0,0,0.09)',
      })
      speckle(ctx, widthMm, heightMm, { mm2PerSpeck: 24, size: [0.3, 0.6], alpha: 0.04 })
      return
    }
  }
}

/**
 * Size of a square swatch that tiles without a visible seam: a whole number of
 * stripe or check repeats, and for twills a whole number of diagonal steps in
 * both directions (the lines rise 2 mm per 1 mm across).
 */
export function fabricTileMm(fabric: FabricPattern): number {
  const repeatsOf = (step: number, near: number) => step * Math.max(1, Math.round(near / step))
  switch (fabric.kind) {
    case 'stripes':
    case 'check':
      return repeatsOf(fabric.periodMm, 120)
    case 'denim':
      return repeatsOf(DENIM_STEP_MM * 2, 110)
    case 'twill':
      return repeatsOf(TWILL_STEP_MM * 2, 108)
    case 'solid':
      return 120
  }
}

/** Average colour of a fabric, used where a single flat colour stands in for it. */
export function fabricBaseColor(fabric: FabricPattern): string {
  switch (fabric.kind) {
    case 'solid':
    case 'denim':
    case 'twill':
      return fabric.color
    case 'stripes':
    case 'check':
      return fabric.base
  }
}
