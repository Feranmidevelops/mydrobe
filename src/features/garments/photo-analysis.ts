import { extractPalette } from './garment.colors'
import type { GarmentTemplateId } from './garment.types'
import { latticeTile, type FabricTile } from './pattern-tile'
import {
  averageColor,
  chooseSwatch,
  coverage,
  coverNeckOpening,
  cropAndFill,
  DEFAULT_BACKGROUND_TOLERANCE,
  erodeMask,
  estimateBackground,
  flattenLighting,
  frontCrop,
  garmentMask,
  maskBounds,
  neckBand,
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
  /** 1 where the photo shows garment, 0 for background; one byte per pixel of `image`. */
  mask: Uint8Array
  background: Rgb | null
  bounds: Rect
  /** Part of the photo projected onto the template's front. */
  crop: Rect
  /** The plain fabric sample, also where the tile below is looked for. */
  swatch: Rect
  fabric: Rgb
  /** Share of the crop that is garment rather than background. */
  coverage: number
  /** The garment's main colours, most common first. */
  palette: Rgb[]
  front: RgbaImage
  /** The plain fabric sample's pixels, evened out. The same object as `tile.pixels` when no repeat was found. */
  swatchPixels: RgbaImage
  /**
   * What tiles over the back, sleeves, collar and caps: one repeat of a
   * check, plaid or stripe, or else the plain sample, mirrored.
   */
  tile: FabricTile
}

/** The leg of a pair of trousers that the plain sample came from, stopping short of the gap between the legs. */
function legAround(crop: Rect, swatch: Rect): Rect {
  const width = Math.floor(crop.width * 0.45)
  const onLeft = swatch.x + swatch.width / 2 < crop.x + crop.width / 2
  return { x: onLeft ? crop.x : crop.x + crop.width - width, y: crop.y, width, height: crop.height }
}

/** Stripes at least this far apart (photo pixels) on trousers may really be a check, read across both legs. */
const COARSE_STRIPES = 30

/**
 * A tile of the fabric's repeat, if it has one (see latticeTile). Tidying the
 * mask fills in the gap between a pair of trousers' legs, and that band of
 * plain backdrop can make a check read as broad stripes, a check's width
 * apart. So when trousers come out as broad stripes, the leg the plain sample
 * came from is searched on its own as well, and a check found there wins.
 * Pinstripes are left alone. The whole crop goes first, as one leg is too
 * narrow to hold a large check's repeat.
 */
export function fabricRepeat(
  templateId: GarmentTemplateId,
  image: RgbaImage,
  solid: Uint8Array,
  crop: Rect,
  swatch: Rect,
): FabricTile | null {
  const tile = latticeTile(image, solid, crop, swatch)
  if (templateId !== 'trousers-straight' || !tile?.stripes || tile.stripes < COARSE_STRIPES) return tile
  const inLeg = latticeTile(image, solid, legAround(crop, swatch), swatch)
  return inLeg && !inLeg.stripes ? inLeg : tile
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
  const tile: FabricTile = fabricRepeat(templateId, image, solid, crop, swatch) ?? {
    pixels: swatchPixels,
    width: swatch.width,
    height: swatch.height,
    wrap: 'mirror',
  }
  // Gaps in the front take the tiled fabric, so patterns carry on through them.
  const filled = cropAndFill(image, solid, crop, tile)
  const front =
    templateId === 'trousers-straight'
      ? filled
      : coverNeckOpening(filled, neckBand(mask, image.width, bounds, crop), tile, fabric, background, [crop.x, crop.y])
  return {
    image,
    mask,
    background,
    bounds,
    crop,
    swatch,
    fabric,
    coverage: coverage(mask, image.width, crop),
    palette: extractPalette(image, solid, bounds),
    front,
    swatchPixels,
    tile,
  }
}
