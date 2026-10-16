import { useEffect, useRef, useState } from 'react'
import type { GarmentTemplateId } from '../features/garments/garment.types'
import type { Rect, Rgb, RgbaImage } from '../features/garments/photo-mapping'
import {
  analyseGarmentPhoto,
  loadPhotoPixels,
  type PhotoAnalysis,
} from '../features/mannequin/photo-textures'

const LOW_COVERAGE = 0.75

function rgbCss([r, g, b]: Rgb) {
  return `rgb(${r} ${g} ${b})`
}

/** Draws raw pixels, plus optional outlined boxes on top. */
function PixelCanvas({
  pixels,
  boxes = [],
  label,
}: {
  pixels: RgbaImage
  boxes?: { rect: Rect; color: string }[]
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = pixels.width
    canvas.height = pixels.height
    const imageData = new ImageData(pixels.width, pixels.height)
    imageData.data.set(pixels.data)
    ctx.putImageData(imageData, 0, 0)
    ctx.lineWidth = Math.max(2, pixels.width / 220)
    for (const { rect, color } of boxes) {
      ctx.strokeStyle = color
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    }
  }, [pixels, boxes])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="h-auto max-h-56 w-full rounded-md bg-white object-contain"
    />
  )
}

interface PhotoAnalysisViewProps {
  url: string
  templateId: GarmentTemplateId
  tolerance: number
}

/** What the mapping saw in a photo: its crop, fabric sample and background. */
export function PhotoAnalysisView({ url, templateId, tolerance }: PhotoAnalysisViewProps) {
  const key = `${url}|${templateId}|${tolerance}`
  const [result, setResult] = useState<{ key: string; analysis?: PhotoAnalysis; error?: string } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    loadPhotoPixels(url)
      .then((pixels) => analyseGarmentPhoto(pixels, templateId, tolerance))
      .then((analysis) => {
        if (!cancelled) setResult({ key, analysis })
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ key, error: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [key, url, templateId, tolerance])

  const current = result?.key === key ? result : null
  if (!current) return <p className="text-xs text-muted">Analysing the photo…</p>
  if (!current.analysis) {
    return (
      <p role="alert" className="rounded-md bg-warn-soft p-3 text-xs text-warn">
        {current.error}
      </p>
    )
  }

  const { analysis } = current
  const boxes = [
    { rect: analysis.bounds, color: 'rgba(28, 26, 23, 0.35)' },
    { rect: analysis.crop, color: '#c08a52' },
    { rect: analysis.swatch, color: '#4a2d1f' },
  ]

  return (
    <div className="space-y-4 text-xs">
      <figure>
        <PixelCanvas pixels={analysis.image} boxes={boxes} label="Photo with the chosen crop and fabric sample" />
        <figcaption className="mt-1 text-muted">
          <span className="font-medium text-[#c08a52]">Crop</span> onto the front ·{' '}
          <span className="font-medium text-espresso">fabric sample</span> for back and sleeves
        </figcaption>
      </figure>
      <figure>
        <PixelCanvas pixels={analysis.front} label="Front texture after filling background gaps" />
        <figcaption className="mt-1 text-muted">Front texture, gaps filled with the fabric colour</figcaption>
      </figure>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        <dt className="text-muted">Background</dt>
        <dd className="flex items-center gap-2">
          {analysis.background ? (
            <>
              <span className="size-3.5 rounded-sm ring-1 ring-line" style={{ background: rgbCss(analysis.background) }} />
              {rgbCss(analysis.background)}
            </>
          ) : (
            'Transparent (cut-out)'
          )}
        </dd>
        <dt className="text-muted">Fabric</dt>
        <dd className="flex items-center gap-2">
          <span className="size-3.5 rounded-sm ring-1 ring-line" style={{ background: rgbCss(analysis.fabric) }} />
          {rgbCss(analysis.fabric)}
        </dd>
        <dt className="text-muted">Coverage</dt>
        <dd>{Math.round(analysis.coverage * 100)}% of the crop is garment</dd>
        <dt className="text-muted">Crop</dt>
        <dd>
          {analysis.crop.width} × {analysis.crop.height} px of {analysis.image.width} × {analysis.image.height}
        </dd>
      </dl>
      {analysis.coverage < LOW_COVERAGE && (
        <p role="alert" className="rounded-md bg-warn-soft p-2 text-warn">
          Low coverage: the garment may not have separated cleanly from the background. Try a different
          tolerance.
        </p>
      )}
    </div>
  )
}
