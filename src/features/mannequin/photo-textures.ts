import { CanvasTexture, MirroredRepeatWrapping, RepeatWrapping, SRGBColorSpace, type Wrapping } from 'three'
import type { GarmentTemplateId } from '../garments/garment.types'
import { analysePhotoAt } from '../garments/analyse-photo'
import type { PhotoAnalysis } from '../garments/photo-analysis'
import { DEFAULT_BACKGROUND_TOLERANCE, resampleTile } from '../garments/photo-mapping'
import type { FabricTile } from '../garments/pattern-tile'
import { loadPhotoPixels, pixelsToCanvas } from '../../lib/image-processing'
import type { GarmentTextures } from './garment-textures'
import type { FrontPanel } from './geometry/garment-geometry'

const FRONT_PX_PER_MM = 1.6
const MAX_TEXTURE_PX = 2048
const SWATCH_PX = 512

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
 * How a fabric tile repeats on the mannequin, whose fabric is laid out in
 * metres: plainly for a whole repeat of a pattern, mirrored for a plain
 * sample (which hides its edges), and as many times per metre as it fits at
 * the scale it had in the photo, taking the crop's width as the panel's.
 */
export function tileRepeat(
  tile: Pick<FabricTile, 'width' | 'height' | 'wrap'>,
  cropWidth: number,
  panelWidth: number,
): { wrap: Wrapping; repeat: [number, number] } {
  return {
    wrap: tile.wrap === 'repeat' ? RepeatWrapping : MirroredRepeatWrapping,
    repeat: [cropWidth / (tile.width * panelWidth), cropWidth / (tile.height * panelWidth)],
  }
}

/**
 * Builds the template's textures from an analysed photo. The crop is stretched
 * over the front panel, and the fabric tile repeats at the scale it had in the
 * photo (see tileRepeat).
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

  // A whole repeat is resized round its own edges, so no line shows where one copy meets the next.
  const { tile } = analysis
  const swatch = new CanvasTexture(
    tile.wrap === 'repeat'
      ? pixelsToCanvas(resampleTile(tile.pixels, SWATCH_PX, 'repeat'))
      : drawScaled(pixelsToCanvas(tile.pixels), SWATCH_PX, SWATCH_PX),
  )
  const { wrap, repeat } = tileRepeat(tile, analysis.crop.width, panelWidth)
  swatch.colorSpace = SRGBColorSpace
  swatch.anisotropy = 8
  swatch.wrapS = wrap
  swatch.wrapT = wrap
  swatch.repeat.set(...repeat)

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
