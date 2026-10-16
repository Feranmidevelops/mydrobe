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
  className?: string
}

export function GarmentThumbnail({ garment, size, className }: GarmentThumbnailProps) {
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
  }, [garment, size])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
