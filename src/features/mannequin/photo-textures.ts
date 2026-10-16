import { CanvasTexture, MirroredRepeatWrapping, SRGBColorSpace } from 'three'
import type { GarmentTemplateId } from '../garments/garment.types'
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
} from '../garments/photo-mapping'
import { loadImage } from '../../lib/load-image'
import type { GarmentTextures } from './garment-textures'
import type { FrontPanel } from './geometry/garment-geometry'

/** Photos are scaled down to this many pixels on their long side before analysis. */
const ANALYSIS_MAX_PX = 1200
const FRONT_PX_PER_MM = 1.6
const MAX_TEXTURE_PX = 2048
const SWATCH_PX = 512

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
    // Gaps in the front take the tiled fabric sample, so patterns carry on.
    front: cropAndFill(image, solid, crop, swatchPixels),
    swatchPixels,
  }
}

/** Loads a photo and reads its pixels, scaled down for quick analysis. */
export async function loadPhotoPixels(url: string): Promise<RgbaImage> {
  const image = await loadImage(url).catch(() => {
    throw new PhotoMappingError("This photo couldn't be loaded.")
  })
  const scale = Math.min(1, ANALYSIS_MAX_PX / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new PhotoMappingError('This browser has no 2D canvas to read the photo with.')
  ctx.drawImage(image, 0, 0, width, height)
  return { data: ctx.getImageData(0, 0, width, height).data, width, height }
}

export function pixelsToCanvas(pixels: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const imageData = new ImageData(pixels.width, pixels.height)
  imageData.data.set(pixels.data)
  canvas.getContext('2d')?.putImageData(imageData, 0, 0)
  return canvas
}

function drawScaled(source: HTMLCanvasElement, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
  }
  return canvas
}

/**
 * Builds the template's textures from an analysed photo. The crop is stretched
 * over the front panel, and the swatch tiles at the scale it had in the photo,
 * taking the crop's width as the panel's width.
 */
export function photoTextures(analysis: PhotoAnalysis, panel: FrontPanel): GarmentTextures {
  const panelWidth = panel.maxX - panel.minX
  const widthMm = panelWidth * 1000
  const heightMm = (panel.maxY - panel.minY) * 1000
  const pxPerMm = Math.min(FRONT_PX_PER_MM, MAX_TEXTURE_PX / widthMm, MAX_TEXTURE_PX / heightMm)

  const front = new CanvasTexture(
    drawScaled(pixelsToCanvas(analysis.front), Math.round(widthMm * pxPerMm), Math.round(heightMm * pxPerMm)),
  )
  front.colorSpace = SRGBColorSpace
  front.anisotropy = 8

  // Mirrored tiling hides the seams a photo sample would otherwise show.
  const swatch = new CanvasTexture(drawScaled(pixelsToCanvas(analysis.swatchPixels), SWATCH_PX, SWATCH_PX))
  const swatchMetres = (analysis.swatch.width / analysis.crop.width) * panelWidth
  swatch.colorSpace = SRGBColorSpace
  swatch.anisotropy = 8
  swatch.wrapS = MirroredRepeatWrapping
  swatch.wrapT = MirroredRepeatWrapping
  swatch.repeat.set(1 / swatchMetres, 1 / swatchMetres)

  return { front, swatch }
}

export async function createPhotoGarmentTextures(
  url: string,
  templateId: GarmentTemplateId,
  panel: FrontPanel,
  tolerance: number = DEFAULT_BACKGROUND_TOLERANCE,
) {
  const analysis = analyseGarmentPhoto(await loadPhotoPixels(url), templateId, tolerance)
  return { analysis, textures: photoTextures(analysis, panel) }
}
