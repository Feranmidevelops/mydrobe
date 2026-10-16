import { CanvasTexture, MirroredRepeatWrapping, SRGBColorSpace } from 'three'
import type { GarmentTemplateId } from '../garments/garment.types'
import { analysePhotoAt } from '../garments/analyse-photo'
import type { PhotoAnalysis } from '../garments/photo-analysis'
import { DEFAULT_BACKGROUND_TOLERANCE, type RgbaImage } from '../garments/photo-mapping'
import { loadPhotoPixels } from '../../lib/image-processing'
import type { GarmentTextures } from './garment-textures'
import type { FrontPanel } from './geometry/garment-geometry'

const FRONT_PX_PER_MM = 1.6
const MAX_TEXTURE_PX = 2048
const SWATCH_PX = 512

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
  const analysis = await analysePhotoAt(url, loadPhotoPixels, templateId, tolerance)
  return { analysis, textures: photoTextures(analysis, panel) }
}
