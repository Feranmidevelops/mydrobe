import type { FabricPattern, Garment } from '../../features/garments/garment.types'
import { drawFabric } from '../../lib/fabric'
import { silhouetteFor } from './garment-silhouettes'

/** Millimetres of fabric represented by one unit of the 100-unit silhouette box. */
const MM_PER_UNIT = 6

/** A wire hook, drawn in the 100 × 100 box above where the collar ends up. */
const HANGER_HOOK =
  'M50 22 V12.5 C50 10 52.6 9 52.6 6.6 C52.6 4.6 51.4 3.3 49.6 3.3 C47.9 3.3 46.8 4.5 46.8 6'

/** Draws a garment photo centred in a square canvas of `pixels` × `pixels`, with a little padding. */
export function drawPhotoThumbnail(ctx: CanvasRenderingContext2D, image: HTMLImageElement, pixels: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, pixels, pixels)
  const box = pixels * 0.88
  const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  ctx.drawImage(image, (pixels - width) / 2, (pixels - height) / 2, width, height)
}

/**
 * Draws a demo garment as a flat-lay product shot filling a square canvas of
 * `pixels` × `pixels`, optionally hanging from a hanger hook.
 */
export function drawFlatLay(
  ctx: CanvasRenderingContext2D,
  garment: Pick<Garment, 'category' | 'templateId'>,
  fabric: FabricPattern,
  pixels: number,
  { hanger = false }: { hanger?: boolean } = {},
) {
  const silhouette = silhouetteFor(garment)
  const outline = new Path2D(silhouette.outline)

  ctx.setTransform(pixels / 100, 0, 0, pixels / 100, 0, 0)
  ctx.clearRect(0, 0, 100, 100)

  if (hanger) {
    ctx.save()
    ctx.strokeStyle = 'rgba(74, 45, 31, 0.75)'
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.stroke(new Path2D(HANGER_HOOK))
    ctx.restore()
    // Shrink the garment and drop it below the hook.
    ctx.translate(8, 13)
    ctx.scale(0.84, 0.84)
  }

  ctx.save()
  ctx.shadowColor = 'rgba(28, 26, 23, 0.16)'
  ctx.shadowBlur = (6 * pixels) / 100
  ctx.shadowOffsetY = (2 * pixels) / 100
  ctx.fillStyle = '#fff'
  ctx.fill(outline)
  ctx.restore()

  ctx.save()
  ctx.clip(outline)
  ctx.save()
  ctx.scale(1 / MM_PER_UNIT, 1 / MM_PER_UNIT)
  drawFabric(ctx, fabric, 100 * MM_PER_UNIT, 100 * MM_PER_UNIT)
  ctx.restore()

  const shade = ctx.createLinearGradient(0, 0, 100, 100)
  shade.addColorStop(0, 'rgba(255,255,255,0.14)')
  shade.addColorStop(1, 'rgba(0,0,0,0.10)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, 100, 100)
  ctx.restore()

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(28, 26, 23, 0.28)'
  ctx.lineWidth = 0.6
  if (silhouette.details) ctx.stroke(new Path2D(silhouette.details))
  ctx.stroke(outline)

  ctx.fillStyle = 'rgba(250, 248, 244, 0.85)'
  for (const [x, y] of silhouette.buttons) {
    ctx.beginPath()
    ctx.arc(x, y, 1.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
