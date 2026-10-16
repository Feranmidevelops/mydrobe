import type { GarmentCategory, GarmentTemplateId } from './garment.types'
import { DEFAULT_BACKGROUND_TOLERANCE, type Rect, type RgbaImage } from './photo-mapping'

export type Sleeves = 'long' | 'short'

/** The 3D template for what the person says a garment is, or null for kinds shown in 2D only. */
export function templateFor(category: GarmentCategory, sleeves: Sleeves): GarmentTemplateId | null {
  if (category === 'shirt') return sleeves === 'long' ? 'shirt-long-sleeve' : 'shirt-short-sleeve'
  if (category === 'trousers') return 'trousers-straight'
  return null
}

/**
 * The template to analyse a photo with. Pieces without a 3D template still
 * need a cut-out and colours, and the trousers crop is the garment's whole
 * outline, so it suits anything.
 */
export function analysisTemplateFor(templateId: GarmentTemplateId | null): GarmentTemplateId {
  return templateId ?? 'trousers-straight'
}

/** The background removal slider. Higher values count more of the photo as background. */
export const SEPARATION_RANGE = { min: 20, max: 160, step: 5, initial: DEFAULT_BACKGROUND_TOLERANCE }

const LOW_COVERAGE = 0.75
const SMALL_GARMENT = 0.08

/** Gentle notes about a photo that will still work, just not as well as it could. */
export function reviewWarnings(
  analysis: { image: Pick<RgbaImage, 'width' | 'height'>; bounds: Rect; coverage: number },
  templateId: GarmentTemplateId | null,
): string[] {
  const { image, bounds } = analysis
  const warnings: string[] = []
  const touchesEdge =
    bounds.x <= 1 ||
    bounds.y <= 1 ||
    bounds.x + bounds.width >= image.width - 1 ||
    bounds.y + bounds.height >= image.height - 1
  if (touchesEdge) {
    warnings.push('Part of the garment looks cut off at the edge of the photo. It works best fully in frame.')
  }
  if ((bounds.width * bounds.height) / (image.width * image.height) < SMALL_GARMENT) {
    warnings.push('The garment is quite small in the photo. A closer shot will show more detail.')
  }
  if (templateId && analysis.coverage < LOW_COVERAGE) {
    warnings.push(
      'Some background may show on the mannequin. Try sliding towards "Remove more", or a plainer background.',
    )
  }
  return warnings
}
