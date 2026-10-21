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

/** A width and height, in photo pixels for the crop and in metres for the front panel. */
interface Size {
  width: number
  height: number
}

/**
 * How a fabric tile repeats on the mannequin, whose fabric is laid out in
 * metres. A plain sample is mirrored, which hides its edges, at the scale the
 * crop's width had on the panel, as it always was.
 *
 * A whole repeat of a pattern wraps plainly, at the scale the front panel
 * shows the photo across and down, so its checks are the same size front and
 * back. It's also turned over left to right: round the back and sleeves the
 * fabric's coordinates run the other way to the front's, which mirrored
 * tiling never showed, but a plaid or houndstooth would read backwards.
 */
export function tileRepeat(
  tile: Pick<FabricTile, 'width' | 'height' | 'wrap'>,
  crop: Size,
  panel: Size,
): { wrap: Wrapping; repeat: [number, number] } {
  if (tile.wrap !== 'repeat') {
    const perMetre = crop.width / (tile.width * panel.width)
    return { wrap: MirroredRepeatWrapping, repeat: [perMetre, crop.width / (tile.height * panel.width)] }
  }
  return {
    wrap: RepeatWrapping,
    repeat: [-crop.width / (tile.width * panel.width), crop.height / (tile.height * panel.height)],
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
  const { wrap, repeat } = tileRepeat(tile, analysis.crop, { width: panelWidth, height: panel.maxY - panel.minY })
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
