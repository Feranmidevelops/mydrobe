import { drawFlatLay } from '../components/wardrobe/flat-lay'
import { DEMO_GARMENTS } from '../features/garments/demo-garments'
import type { GarmentTemplateId } from '../features/garments/garment.types'

export interface TrialSample {
  id: string
  name: string
  url: string
  group: 'baseline' | 'photo'
  /** Best guess at the template; the trial page lets you change it. */
  templateId: GarmentTemplateId
}

/** Guesses the template from a file name such as "blue-jeans.jpg" or "white-tee.png". */
export function guessTemplate(fileName: string): GarmentTemplateId {
  if (/trouser|jean|pant|chino|denim|slack|jogger/i.test(fileName)) return 'trousers-straight'
  if (/tee|t-shirt|tshirt|short.?sleeve|polo|top/i.test(fileName)) return 'shirt-short-sleeve'
  return 'shirt-long-sleeve'
}

/**
 * Photos dropped into trial-photos/ (git-ignored, so they stay on this
 * machine). Vite resolves them to URLs at dev time.
 */
const localPhotos = import.meta.glob('/trial-photos/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export function photoSamples(): TrialSample[] {
  return Object.entries(localPhotos)
    .map(([path, url]) => {
      const fileName = path.split('/').pop() ?? path
      return {
        id: `photo:${fileName}`,
        name: fileName,
        url,
        group: 'photo' as const,
        templateId: guessTemplate(fileName),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The best case: each demo garment drawn as a clean flat-lay on white. If
 * these don't look right on the mannequin, real photos won't either.
 */
export function baselineSamples(size = 900): TrialSample[] {
  return DEMO_GARMENTS.flatMap((garment) => {
    if (garment.templateId === null || garment.source.kind !== 'demo') return []
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    drawFlatLay(ctx, garment, garment.source.fabric, size)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    return [
      {
        id: `baseline:${garment.id}`,
        name: garment.name,
        url: canvas.toDataURL('image/png'),
        group: 'baseline' as const,
        templateId: garment.templateId,
      },
    ]
  })
}
