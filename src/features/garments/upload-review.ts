import type { GarmentCategory, GarmentTemplateId } from './garment.types'
import type { FabricTile, Vec } from './pattern-tile'
import { DEFAULT_BACKGROUND_TOLERANCE, type Rect, type Rgb, type RgbaImage } from './photo-mapping'

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
/**
 * A top's front this wide for its length looks folded or cut short: whole
 * tops measure about 0.5 on a hanger and up to about 0.75 laid flat.
 */
const FOLDED_ASPECT = 0.85

/** Gentle notes about a photo that will still work, just not as well as it could. */
export function reviewWarnings(
  analysis: { image: Pick<RgbaImage, 'width' | 'height'>; bounds: Rect; crop: Rect; coverage: number },
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
  } else if (templateId && templateId !== 'trousers-straight' && analysis.crop.width > analysis.crop.height * FOLDED_ASPECT) {
    warnings.push('This looks folded or cut short, so only part of its front will show. A whole front, laid flat or on a hanger, works best.')
  }
  // Trial photos found this little only when most of the garment was missed
  // (a close-up, a busy background, a garment close in colour to it), so
  // that comes first, though a far-off shot of a whole garment can do it too.
  if ((bounds.width * bounds.height) / (image.width * image.height) < SMALL_GARMENT) {
    warnings.push(
      "Only a small part of the photo was picked out as the garment. If some of the garment looks faded, try a photo of it on its own against a plain background that's clearly lighter or darker. If it's all there, a closer shot will show more detail.",
    )
  }
  // What isn't picked out inside the front is filled with the garment's fabric,
  // so nothing of the background reaches the mannequin; what's missed is the photo's own detail.
  if (templateId && analysis.coverage < LOW_COVERAGE) {
    warnings.push(
      templateId === 'trousers-straight'
        ? "Part of the front wasn't picked out as garment, so it will be filled in with the garment's fabric. That's expected between the legs. If some of the trousers look faded, slide towards \"Keep more\"."
        : "Part of the front wasn't picked out as garment, so it will be filled in with the garment's fabric. If some of the garment looks faded, slide towards \"Keep more\".",
    )
  }
  return warnings
}

/**
 * A copy of the photo with everything that isn't garment faded towards
 * `tint`, so the cut-out stands out. Transparent background takes the tint.
 */
export function fadeBackground(image: RgbaImage, mask: Uint8Array, tint: Rgb, strength = 0.75): RgbaImage {
  const data = new Uint8ClampedArray(image.data)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) continue
    const offset = i * 4
    const fade = data[offset + 3] < 128 ? 1 : strength
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] += (tint[channel] - data[offset + channel]) * fade
    }
    data[offset + 3] = 255
  }
  return { data, width: image.width, height: image.height }
}

/**
 * The corners, in photo pixels, of the fabric that covers the back and
 * sleeves: one repeat of the pattern where one was found, which can sit at a
 * slant, or else the plain sample.
 */
export function fabricOutline({ swatch, tile }: { swatch: Rect; tile: Pick<FabricTile, 'placement'> }): Vec[] {
  if (tile.placement) {
    const { origin: [x, y], u, v } = tile.placement
    return [
      [x, y],
      [x + u[0], y + u[1]],
      [x + u[0] + v[0], y + u[1] + v[1]],
      [x + v[0], y + v[1]],
    ]
  }
  const { x, y, width, height } = swatch
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]
}
