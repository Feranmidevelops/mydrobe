import { fabricBaseColor } from '../../lib/fabric'
import type { Garment } from '../garments/garment.types'

/** A neutral stand-in for a photo garment whose main colour isn't known. */
export const PHOTO_PLACEHOLDER_COLOR = '#cdbfb1'

/**
 * The flat colour a garment shows until its textures are ready, or for good
 * if they can't be made: its fabric for demo pieces, and the photo's main
 * colour for uploads, so the mannequin looks right even before the photo is.
 */
export function placeholderColor(garment: Garment): string {
  if (garment.source.kind === 'demo') return fabricBaseColor(garment.source.fabric)
  return garment.palette?.[0] ?? PHOTO_PLACEHOLDER_COLOR
}
