import { CanvasTexture, MirroredRepeatWrapping, RepeatWrapping, SRGBColorSpace, type Wrapping } from 'three'
import type { GarmentTemplateId } from '../garments/garment.types'
import { analysePhotoAt } from '../garments/analyse-photo'
import type { PhotoAnalysis } from '../garments/photo-analysis'
import { DEFAULT_BACKGROUND_TOLERANCE, resampleTile, type Rect, type RgbaImage } from '../garments/photo-mapping'
import type { FabricTile } from '../garments/pattern-tile'
import { loadPhotoPixels, pixelsToCanvas } from '../../lib/image-processing'
import type { GarmentTextures } from './garment-textures'
import type { FrontPanel } from './geometry/garment-geometry'

const FRONT_PX_PER_MM = 1.6
const MAX_TEXTURE_PX = 2048
const SWATCH_PX = 512

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function drawScaled(source: HTMLCanvasElement, width: number, height: number) {
  const canvas = createCanvas(width, height)
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
 * How wide the front of a top is for its length in a photo of the whole
 * thing: hanger photos of a tee, a graphic tee and a flannel shirt measured
 * 0.50 to 0.54. A crop that is a good deal wider than this has been folded or
 * cut off, so its width, not its length, says how big it is.
 */
export const TYPICAL_FRONT_ASPECT = 0.55
/**
 * Crops up to this wide for their length can still be a whole top, such as a
 * boxy tee laid flat, so they are sized by their length.
 */
export const WHOLE_FRONT_ASPECT = 0.75
/** Crops at least as wide as they are long are taken to be folded or cut off. */
export const CUT_OFF_ASPECT = 1

/**
 * How many photo pixels of the crop go to a metre of the front panel, the
 * same across and down, so a round print stays round.
 *
 * A photo of a whole top is sized by its length, which is the panel's height
 * on every body, so a print keeps its size from Small to Large. A folded or
 * cut-off photo doesn't show the whole length, so it's sized by its width,
 * taken to be a typical front's width for a top of the panel's length; it
 * then shows at its true shape, padded below, rather than pulled down to the
 * hem. Crops in between ease from one to the other, so a slightly different
 * crop never makes the print jump in size.
 */
export function frontScale(crop: Size, panelHeight: number): number {
  const aspect = crop.width / crop.height
  const cutOff = Math.min(1, Math.max(0, (aspect - WHOLE_FRONT_ASPECT) / (CUT_OFF_ASPECT - WHOLE_FRONT_ASPECT)))
  // The width the crop is drawn at, as a share of the panel's height.
  const drawnWidth = Math.min(aspect, WHOLE_FRONT_ASPECT + (TYPICAL_FRONT_ASPECT - WHOLE_FRONT_ASPECT) * cutOff)
  return crop.width / (drawnWidth * panelHeight)
}

/** A rectangle on the front panel, in metres from its top left corner. */
export interface PanelRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where the crop goes on the front panel at `pxPerMetre`: centred across,
 * with its top (the collar) at the top of the panel. Whatever reaches past
 * the panel is trimmed, and where it falls short, at the sides of a wider
 * body or below a folded or cut-off photo, the fabric is padded out.
 */
export function frontLayout(crop: Size, panel: Size, pxPerMetre: number): PanelRect {
  const width = crop.width / pxPerMetre
  const height = crop.height / pxPerMetre
  return { x: (panel.width - width) / 2, y: 0, width, height }
}

/**
 * Where a garment's crop goes on its front panel, and how many photo pixels
 * it shows to the metre down the panel. A top keeps its shape (see
 * frontScale and frontLayout). A pair of trousers is spread over the whole
 * panel, so the legs in the photo land on the mannequin's legs; down the legs
 * it shows the photo's full length.
 */
export function frontFit(
  templateId: GarmentTemplateId,
  crop: Size,
  panel: Size,
): { layout: PanelRect; pxPerMetre: number } {
  if (templateId === 'trousers-straight') {
    return { layout: { x: 0, y: 0, width: panel.width, height: panel.height }, pxPerMetre: crop.height / panel.height }
  }
  const pxPerMetre = frontScale(crop, panel.height)
  return { layout: frontLayout(crop, panel, pxPerMetre), pxPerMetre }
}

/** A 2D affine transform, [a, b, c, d, e, f] as DOMMatrix takes them: x' = a x + c y + e, y' = b x + d y + f. */
export type Affine = [number, number, number, number, number, number]

/**
 * The transform that lays the fabric tile, in its own texels, onto the front
 * canvas in step with the photo drawn at `drawn` (canvas pixels): the same
 * sums tileAt does when it fills gaps in the crop, so a check carries on from
 * the photo into the padding without a jump. A tile of the fabric's repeat
 * sits where its placement says it came from in the photo; any other tile
 * repeats from the crop's corner, one tile to every tile.width photo pixels.
 */
export function fabricTransform(
  tile: Pick<FabricTile, 'pixels' | 'width' | 'height' | 'placement'>,
  crop: Rect,
  drawn: PanelRect,
): Affine {
  const kx = drawn.width / crop.width
  const ky = drawn.height / crop.height
  const { origin, u, v } = tile.placement ?? { origin: [crop.x, crop.y], u: [tile.width, 0], v: [0, tile.height] }
  const { width, height } = tile.pixels
  return [
    (kx * u[0]) / width,
    (ky * u[1]) / width,
    (kx * v[0]) / height,
    (ky * v[1]) / height,
    drawn.x + (origin[0] - crop.x) * kx,
    drawn.y + (origin[1] - crop.y) * ky,
  ]
}

/**
 * A plain sample laid out with its mirror images, twice as wide and high, so
 * it repeats plainly the way the sample itself is mirrored round the back.
 */
export function mirroredTile(pixels: RgbaImage): RgbaImage {
  const { width, height } = pixels
  const data = new Uint8ClampedArray(width * height * 16)
  for (let y = 0; y < height * 2; y++) {
    const from = y < height ? y : height * 2 - 1 - y
    for (let x = 0; x < width * 2; x++) {
      const column = x < width ? x : width * 2 - 1 - x
      const source = (from * width + column) * 4
      data.set(pixels.data.subarray(source, source + 4), (y * width * 2 + x) * 4)
    }
  }
  return { data, width: width * 2, height: height * 2 }
}

/** Which sides of the photo fall inside the canvas, where fabric pads it out. Half a pixel either way is a match. */
export function paddedSides(drawn: PanelRect, width: number, height: number) {
  return {
    left: drawn.x > 0.5,
    right: drawn.x + drawn.width < width - 0.5,
    top: drawn.y > 0.5,
    bottom: drawn.y + drawn.height < height - 0.5,
  }
}

/**
 * How far into the photo a padded side fades out, as a share of the photo's
 * width: past the shading where a hanging shirt turns away at its sides.
 */
const FEATHER = 0.06

/**
 * The photo drawn at `drawn`, fading out along each padded side, so its own
 * shading at the edges blends into the fabric rather than ending in a line.
 */
function featheredPhoto(photo: HTMLCanvasElement, drawn: PanelRect, width: number, height: number) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(photo, drawn.x, drawn.y, drawn.width, drawn.height)
  ctx.globalCompositeOperation = 'destination-in'
  const fade = (x0: number, y0: number, x1: number, y1: number) => {
    const ramp = ctx.createLinearGradient(x0, y0, x1, y1)
    for (let i = 0; i <= 4; i++) {
      const t = i / 4
      ramp.addColorStop(t, `rgba(0, 0, 0, ${t * t * (3 - 2 * t)})`)
    }
    ctx.fillStyle = ramp
    ctx.fillRect(0, 0, width, height)
  }
  const reach = drawn.width * FEATHER
  const sides = paddedSides(drawn, width, height)
  const [right, bottom] = [drawn.x + drawn.width, drawn.y + drawn.height]
  if (sides.left) fade(drawn.x, 0, drawn.x + reach, 0)
  if (sides.right) fade(right, 0, right - reach, 0)
  if (sides.top) fade(0, drawn.y, 0, drawn.y + reach)
  if (sides.bottom) fade(0, bottom, 0, bottom - reach)
  return canvas
}

/**
 * The front texture: the crop at `layout` on a canvas the panel's shape, over
 * the fabric tile laid in step with it wherever the photo doesn't reach.
 */
function drawFront(analysis: PhotoAnalysis, layout: PanelRect, panel: Size, pxPerMetre: number) {
  const width = Math.round(panel.width * pxPerMetre)
  const height = Math.round(panel.height * pxPerMetre)
  const [sx, sy] = [width / panel.width, height / panel.height]
  const drawn = { x: layout.x * sx, y: layout.y * sy, width: layout.width * sx, height: layout.height * sy }
  const photo = pixelsToCanvas(analysis.front)
  const sides = paddedSides(drawn, width, height)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingQuality = 'high'
  // Where nothing needs padding, the photo still goes where its layout puts
  // it: across the whole canvas for trousers, or reaching past the sides of a
  // narrow body, which trims it, rather than being squeezed in.
  if (!sides.left && !sides.right && !sides.top && !sides.bottom) {
    ctx.drawImage(photo, drawn.x, drawn.y, drawn.width, drawn.height)
    return canvas
  }

  const { tile, crop } = analysis
  const pattern = ctx.createPattern(pixelsToCanvas(tile.wrap === 'mirror' ? mirroredTile(tile.pixels) : tile.pixels), 'repeat')
  if (pattern) {
    pattern.setTransform(new DOMMatrix(fabricTransform(tile, crop, drawn)))
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(featheredPhoto(photo, drawn, width, height), 0, 0)
  return canvas
}

/**
 * How a fabric tile repeats on the mannequin, whose fabric is laid out in
 * metres. A plain sample is mirrored, which hides its edges, at the scale the
 * crop's width had on the panel, as it always was.
 *
 * A whole repeat of a pattern wraps plainly at `pxPerMetre`, the scale the
 * front shows the photo at, the same across and down, so its checks keep
 * their shape and are the same size front and back. It's also turned over
 * left to right: round the back and sleeves the fabric's coordinates run the
 * other way to the front's, which mirrored tiling never showed, but a plaid
 * or houndstooth would read backwards.
 */
export function tileRepeat(
  tile: Pick<FabricTile, 'width' | 'height' | 'wrap'>,
  crop: Size,
  panel: Size,
  pxPerMetre: number,
): { wrap: Wrapping; repeat: [number, number] } {
  if (tile.wrap !== 'repeat') {
    const perMetre = crop.width / (tile.width * panel.width)
    return { wrap: MirroredRepeatWrapping, repeat: [perMetre, crop.width / (tile.height * panel.width)] }
  }
  return { wrap: RepeatWrapping, repeat: [-pxPerMetre / tile.width, pxPerMetre / tile.height] }
}

/**
 * Builds the template's textures from an analysed photo: the crop laid on
 * the front panel as frontFit says, padded out with the fabric where it
 * doesn't reach, and the fabric tile repeating at the scale it had in the
 * photo (see tileRepeat).
 */
export function photoTextures(analysis: PhotoAnalysis, panel: FrontPanel, templateId: GarmentTemplateId): GarmentTextures {
  const size = { width: panel.maxX - panel.minX, height: panel.maxY - panel.minY }
  const pxPerMm = Math.min(FRONT_PX_PER_MM, MAX_TEXTURE_PX / (size.width * 1000), MAX_TEXTURE_PX / (size.height * 1000))
  const { layout, pxPerMetre } = frontFit(templateId, analysis.crop, size)

  const front = new CanvasTexture(drawFront(analysis, layout, size, pxPerMm * 1000))
  front.colorSpace = SRGBColorSpace
  front.anisotropy = 8

  // A whole repeat is resized round its own edges, so no line shows where one copy meets the next.
  const { tile } = analysis
  const swatch = new CanvasTexture(
    tile.wrap === 'repeat'
      ? pixelsToCanvas(resampleTile(tile.pixels, SWATCH_PX, 'repeat'))
      : drawScaled(pixelsToCanvas(tile.pixels), SWATCH_PX, SWATCH_PX),
  )
  const { wrap, repeat } = tileRepeat(tile, analysis.crop, size, pxPerMetre)
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
  return { analysis, textures: photoTextures(analysis, panel, templateId) }
}
