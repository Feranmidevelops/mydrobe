import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { FabricPattern, GarmentTemplateId } from '../garments/garment.types'
import { drawFabric, fabricTileMm } from '../../lib/fabric'
import { limbPoint, SIDES, type BodyShape } from './body-shape'
import type { FrontPanel } from './geometry/garment-geometry'

export interface GarmentTextures {
  /** Front-facing image, stretched over the template's front panel. */
  front: Texture
  /** Seamless fabric swatch for the back, sleeves and collar; repeat is per metre. */
  swatch: Texture
}

const FRONT_PX_PER_MM = 1.6
const MAX_TEXTURE_PX = 2048
const SWATCH_PX = 512

/** Converts body-space metres to millimetres on the front-panel canvas (y down). */
interface PanelMap {
  x: (metres: number) => number
  y: (metres: number) => number
  widthMm: number
  heightMm: number
}

function context2d(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

function stitchColor(fabric: FabricPattern) {
  return fabric.kind === 'denim' ? 'rgba(214, 160, 82, 0.9)' : 'rgba(0, 0, 0, 0.24)'
}

function stitch(ctx: CanvasRenderingContext2D, color: string, draw: () => void) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 0.7
  ctx.setLineDash([3, 2])
  ctx.beginPath()
  draw()
  ctx.stroke()
  ctx.restore()
}

function button(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string) {
  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  for (const dx of [-1.4, 1.4]) {
    ctx.beginPath()
    ctx.arc(x + dx, y, 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawShirtFront(ctx: CanvasRenderingContext2D, map: PanelMap, fabric: FabricPattern) {
  const centre = map.x(0)
  const thread = stitchColor(fabric)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.035)'
  ctx.fillRect(centre - 17, 0, 34, map.heightMm)
  stitch(ctx, thread, () => {
    for (const x of [centre - 17, centre + 17]) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, map.heightMm)
    }
  })
  for (let y = map.y(1.4); y < map.heightMm - 45; y += 95) {
    button(ctx, centre, y, 5, 'rgba(250, 248, 244, 0.95)')
  }

  // Chest pocket on the wearer's left, which faces the viewer's right.
  const pocketX = map.x(0.085) - 52
  const pocketY = map.y(1.31)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'
  ctx.fillRect(pocketX, pocketY, 104, 118)
  stitch(ctx, thread, () => {
    ctx.rect(pocketX + 2, pocketY + 2, 100, 114)
    ctx.moveTo(pocketX + 2, pocketY + 14)
    ctx.lineTo(pocketX + 102, pocketY + 14)
  })

  stitch(ctx, thread, () => {
    ctx.moveTo(0, map.heightMm - 12)
    ctx.lineTo(map.widthMm, map.heightMm - 12)
  })
}

function drawTeeFront(ctx: CanvasRenderingContext2D, map: PanelMap, fabric: FabricPattern) {
  const thread = stitchColor(fabric)
  // The neckline is the top edge of the projected panel: a ribbed band.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.07)'
  ctx.fillRect(0, 0, map.widthMm, 14)
  stitch(ctx, thread, () => {
    ctx.moveTo(0, 15)
    ctx.lineTo(map.widthMm, 15)
    ctx.moveTo(0, map.heightMm - 20)
    ctx.lineTo(map.widthMm, map.heightMm - 20)
  })
}

function drawTrousersFront(
  ctx: CanvasRenderingContext2D,
  map: PanelMap,
  fabric: FabricPattern,
  shape: BodyShape,
) {
  const centre = map.x(0)
  const thread = stitchColor(fabric)
  const band = 38

  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
  ctx.fillRect(0, 0, map.widthMm, band)
  stitch(ctx, thread, () => {
    ctx.moveTo(0, 3)
    ctx.lineTo(map.widthMm, 3)
    ctx.moveTo(0, band - 2)
    ctx.lineTo(map.widthMm, band - 2)
  })

  for (const x of [-0.16, -0.07, 0.07, 0.16]) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
    ctx.fillRect(map.x(x) - 5, 0, 10, band + 10)
  }
  button(ctx, centre, band / 2, 7, fabric.kind === 'denim' ? '#b8a27a' : 'rgba(30, 28, 26, 0.85)')

  stitch(ctx, thread, () => {
    // Fly front, then the curved slash of each front pocket.
    ctx.moveTo(centre + 34, band)
    ctx.lineTo(centre + 34, band + 140)
    ctx.quadraticCurveTo(centre + 34, band + 180, centre, band + 190)
    for (const side of SIDES) {
      ctx.moveTo(map.x(0.105 * side), band)
      ctx.quadraticCurveTo(map.x(0.115 * side), band + 120, map.x(0.2 * side), band + 135)
    }
  })

  // Pressed creases down the middle of each leg.
  for (const side of SIDES) {
    const points = Array.from({ length: 12 }, (_, i) => {
      const point = limbPoint(shape.leg, side, 0.14 + (i / 11) * (shape.leg.length - 0.2))
      return [map.x(point.x), map.y(point.y)] as const
    })
    for (const [offset, color, width] of [
      [0, 'rgba(0, 0, 0, 0.08)', 1.6],
      [1.8, 'rgba(255, 255, 255, 0.07)', 1.2],
    ] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + offset, y) : ctx.lineTo(x + offset, y)))
      ctx.stroke()
    }
  }

  stitch(ctx, thread, () => {
    ctx.moveTo(0, map.heightMm - 22)
    ctx.lineTo(map.widthMm, map.heightMm - 22)
  })
}

/** Fabric repeats already drawn, by scale and fabric, newest last. */
const repeats = new Map<string, HTMLCanvasElement>()
const MAX_REPEATS = 16

/**
 * One seamless repeat of the fabric, `tileMm` across, drawn `tilePx` pixels
 * square and kept for next time: drawing its flecks is the slow part.
 */
function fabricRepeat(fabric: FabricPattern, tileMm: number, tilePx: number) {
  const key = `${tilePx}|${JSON.stringify(fabric)}`
  const kept = repeats.get(key)
  if (kept) return kept
  const tile = context2d(tilePx, tilePx)
  if (!tile) return null
  tile.ctx.scale(tilePx / tileMm, tilePx / tileMm)
  drawFabric(tile.ctx, fabric, tileMm, tileMm)
  repeats.set(key, tile.canvas)
  if (repeats.size > MAX_REPEATS) repeats.delete(repeats.keys().next().value!)
  return tile.canvas
}

/**
 * The front of a demo garment for the given body: its fabric at true scale, so
 * stripes stay the same width on every preset, with the seams, buttons and
 * pockets drawn over it. The fabric is one repeat filled across as a pattern,
 * which the graphics card tiles in a single draw, instead of every fleck drawn
 * again over the whole front for each body size. Returns null when the browser
 * offers no 2D canvas.
 */
export function createDemoFrontTexture(
  fabric: FabricPattern,
  templateId: GarmentTemplateId,
  panel: FrontPanel,
  shape: BodyShape,
): Texture | null {
  const widthMm = (panel.maxX - panel.minX) * 1000
  const heightMm = (panel.maxY - panel.minY) * 1000
  const tileMm = fabricTileMm(fabric)
  // A whole number of pixels per repeat, so the pattern tiles without resampling.
  const tilePx = Math.max(1, Math.floor(tileMm * Math.min(FRONT_PX_PER_MM, MAX_TEXTURE_PX / widthMm, MAX_TEXTURE_PX / heightMm)))
  const pxPerMm = tilePx / tileMm

  const front = context2d(Math.round(widthMm * pxPerMm), Math.round(heightMm * pxPerMm))
  const repeat = fabricRepeat(fabric, tileMm, tilePx)
  const pattern = repeat && front?.ctx.createPattern(repeat, 'repeat')
  if (!front || !pattern) return null

  const map: PanelMap = {
    x: (metres) => (metres - panel.minX) * 1000,
    y: (metres) => (panel.maxY - metres) * 1000,
    widthMm,
    heightMm,
  }
  front.ctx.fillStyle = pattern
  front.ctx.fillRect(0, 0, front.canvas.width, front.canvas.height)
  front.ctx.scale(pxPerMm, pxPerMm)
  switch (templateId) {
    case 'shirt-long-sleeve':
      drawShirtFront(front.ctx, map, fabric)
      break
    case 'shirt-short-sleeve':
      drawTeeFront(front.ctx, map, fabric)
      break
    case 'trousers-straight':
      drawTrousersFront(front.ctx, map, fabric, shape)
      break
  }

  const texture = new CanvasTexture(front.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * The demo fabric for the back, sleeves and collar: a seamless repeat that the
 * texture tiles, so it's the same on every body size. Returns null when the
 * browser offers no 2D canvas.
 */
export function createDemoSwatchTexture(fabric: FabricPattern): Texture | null {
  const tileMm = fabricTileMm(fabric)
  const swatch = context2d(SWATCH_PX, SWATCH_PX)
  if (!swatch) return null
  swatch.ctx.scale(SWATCH_PX / tileMm, SWATCH_PX / tileMm)
  drawFabric(swatch.ctx, fabric, tileMm, tileMm)

  const texture = new CanvasTexture(swatch.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1000 / tileMm, 1000 / tileMm)
  return texture
}
