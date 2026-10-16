import { useEffect, useRef } from 'react'
import type { Garment } from '../../features/garments/garment.types'
import { loadImage } from '../../lib/load-image'
import { drawFlatLay, drawPhotoThumbnail } from './flat-lay'

interface GarmentThumbnailProps {
  garment: Garment
  /** Rendered size in CSS pixels. */
  size: number
  /** Hang the garment from a hanger hook, like a shop product shot. */
  hanger?: boolean
  /** Fill the container's width; `size` then only sets the drawing resolution. */
  fluid?: boolean
  className?: string
}

export function GarmentThumbnail({
  garment,
  size,
  hanger = false,
  fluid = false,
  className,
}: GarmentThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const pixels = Math.round(size * Math.min(window.devicePixelRatio || 1, 2))
    canvas.width = pixels
    canvas.height = pixels

    const { source } = garment
    if (source.kind === 'demo') {
      drawFlatLay(ctx, garment, source.fabric, pixels, { hanger })
      return
    }

    let cancelled = false
    loadImage(source.url)
      .then((image) => {
        if (!cancelled) drawPhotoThumbnail(ctx, image, pixels)
      })
      .catch(() => {
        // A photo that fails to load leaves the thumbnail blank.
      })
    return () => {
      cancelled = true
    }
  }, [garment, size, hanger])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={fluid ? { width: '100%', aspectRatio: '1 / 1' } : { width: size, height: size }}
    />
  )
}
