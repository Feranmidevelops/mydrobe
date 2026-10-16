import { useEffect, useRef } from 'react'
import type { PhotoAnalysis } from '../../features/garments/photo-analysis'
import type { Rgb } from '../../features/garments/photo-mapping'
import { fadeBackground } from '../../features/garments/upload-review'

/** Brand cream, tan and espresso, as on the rest of the page. */
const FADE_TINT: Rgb = [246, 241, 236]
const FRONT_COLOR = '#835d3e'
const FABRIC_COLOR = '#4a2d1f'

interface SeparationPreviewProps {
  analysis: Pick<PhotoAnalysis, 'image' | 'mask' | 'crop' | 'swatch'>
  /** Outline the front and fabric sample used on the mannequin; off for pieces shown in 2D only. */
  showMapping: boolean
  className?: string
}

/** The uploaded photo with its background faded, so it's clear what counts as garment. */
export function SeparationPreview({ analysis, showMapping, className }: SeparationPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const { image, mask, crop, swatch } = analysis
    canvas.width = image.width
    canvas.height = image.height
    const pixels = new ImageData(image.width, image.height)
    pixels.data.set(fadeBackground(image, mask, FADE_TINT).data)
    ctx.putImageData(pixels, 0, 0)
    if (!showMapping) return

    const line = Math.max(2, image.width / 240)
    ctx.lineWidth = line
    ctx.setLineDash([line * 3, line * 2])
    ctx.strokeStyle = FRONT_COLOR
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height)
    ctx.setLineDash([])
    ctx.strokeStyle = FABRIC_COLOR
    ctx.strokeRect(swatch.x, swatch.y, swatch.width, swatch.height)
  }, [analysis, showMapping])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={
        showMapping
          ? 'Your photo with the background faded, outlining the front and the fabric sample used on the mannequin'
          : 'Your photo with the background faded'
      }
      className={className}
    />
  )
}
