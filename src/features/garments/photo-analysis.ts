import { extractPalette } from './garment.colors'
import type { GarmentTemplateId } from './garment.types'
import {
  averageColor,
  chooseSwatch,
  coverage,
  cropAndFill,
  DEFAULT_BACKGROUND_TOLERANCE,
  erodeMask,
  estimateBackground,
  flattenLighting,
  frontCrop,
  garmentMask,
  maskBounds,
  type Rect,
  type Rgb,
  type RgbaImage,
} from './photo-mapping'

/*
 * Runs the whole photo mapping on one image. Pure: no DOM and no three.js,
 * so it can run in a web worker.
 */

export class PhotoMappingError extends Error {}

/** What the mapping found in a photo, kept so a trial page can show its working. */
export interface PhotoAnalysis {
  image: RgbaImage
  background: Rgb | null
  bounds: Rect
  /** Part of the photo projected onto the template's front. */
  crop: Rect
  /** Fabric sample tiled over the back and sleeves. */
  swatch: Rect
  fabric: Rgb
  /** Share of the crop that is garment rather than background. */
  coverage: number
  /** The garment's main colours, most common first. */
  palette: Rgb[]
  front: RgbaImage
  swatchPixels: RgbaImage
}

export function analyseGarmentPhoto(
  image: RgbaImage,
  templateId: GarmentTemplateId,
  tolerance = DEFAULT_BACKGROUND_TOLERANCE,
): PhotoAnalysis {
  const background = estimateBackground(image)
  const mask = garmentMask(image, background, tolerance)
  const bounds = maskBounds(mask, image.width, image.height)
  if (!bounds) throw new PhotoMappingError("Couldn't find a garment in this photo.")

  const crop = frontCrop(templateId, mask, image.width, bounds)
  // Sample and show only solid garment pixels, so the soft edge where garment
  // meets background doesn't end up as a pale outline on the mannequin.
  const edge = Math.max(1, Math.round(Math.min(image.width, image.height) * 0.004))
  const solid = erodeMask(mask, image.width, image.height, edge)
  const swatch = chooseSwatch(templateId, image, solid, crop)
  const fabric = averageColor(image, solid, swatch)
  const swatchPixels = flattenLighting(cropAndFill(image, solid, swatch, fabric))
  return {
    image,
    background,
    bounds,
    crop,
    swatch,
    fabric,
    coverage: coverage(mask, image.width, crop),
    palette: extractPalette(image, solid, bounds),
    // Gaps in the front take the tiled fabric sample, so patterns carry on.
    front: cropAndFill(image, solid, crop, swatchPixels),
    swatchPixels,
  }
}
