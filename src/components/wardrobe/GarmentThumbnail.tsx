import { useEffect, useRef } from 'react'
import type { Garment } from '../../features/garments/garment.types'
import { drawFabric } from '../../lib/fabric'
import { silhouetteFor } from './garment-silhouettes'

/** Millimetres of fabric represented by one unit of the 100-unit silhouette box. */
const MM_PER_UNIT = 6

interface GarmentThumbnailProps {
  garment: Garment
  /** Rendered size in CSS pixels. */
  size: number
  /** Hang the garment from a hanger hook, like a shop product shot. */
  hanger?: boolean
  className?: string
}

/** A wire hook, drawn in the 100 × 100 box above where the collar ends up. */
const HANGER_HOOK =
  'M50 22 V12.5 C50 10 52.6 9 52.6 6.6 C52.6 4.6 51.4 3.3 49.6 3.3 C47.9 3.3 46.8 4.5 46.8 6'

export function GarmentThumbnail({ garment, size, hanger = false, className }: GarmentThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const pixels = Math.round(size * Math.min(window.devicePixelRatio || 1, 2))
    canvas.width = pixels
    canvas.height = pixels

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
    drawFabric(ctx, garment.source.fabric, 100 * MM_PER_UNIT, 100 * MM_PER_UNIT)
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
  }, [garment, size, hanger])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
