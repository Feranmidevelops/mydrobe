import { db } from '../../lib/db'
import type { Garment } from '../garments/garment.types'
import { withoutGarment } from './outfit.operations'
import type { Outfit } from './outfit.types'

/** The outfits saved on this device, newest first. */
export function listOutfits(): Promise<Outfit[]> {
  return db.outfits.orderBy('createdAt').reverse().toArray()
}

/** Saves a new outfit, or replaces the saved one with the same id. */
export async function putOutfit(outfit: Outfit) {
  await db.outfits.put(outfit)
}

export async function deleteOutfit(id: string) {
  await db.outfits.delete(id)
}

/**
 * Marks a removed garment as missing in every saved outfit that used it, so
 * no outfit is left pointing at a garment that isn't there.
 */
export async function removeGarmentFromOutfits(garment: Pick<Garment, 'id' | 'category'>, now = Date.now()) {
  await db.outfits
    .filter((outfit) => outfit.garmentIds[garment.category] === garment.id)
    .modify((outfit) => {
      Object.assign(outfit, withoutGarment(outfit, garment, now))
    })
}
