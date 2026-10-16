import type { GarmentCategory } from '../garments/garment.types'
import type { BodyPreset } from '../mannequin/viewer.types'
import type { GarmentSelection } from './outfit.selection'

/**
 * A saved combination of garments, kept on this device. It refers to garments
 * by id and never copies their photos.
 */
export interface Outfit {
  id: string
  /** Chosen by the person; never empty. */
  name: string
  /** The body shape it was saved on, restored when it's reopened. */
  bodyPreset: BodyPreset
  /** One garment per slot, by category. */
  garmentIds: GarmentSelection
  /** Slots whose garment has since been removed from the wardrobe. */
  missingSlots: GarmentCategory[]
  createdAt: number
  updatedAt: number
}
