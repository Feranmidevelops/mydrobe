import { useWardrobeStore } from '../../store/wardrobe.store'
import type { Garment } from '../garments/garment.types'
import { wardrobeGarments } from '../garments/wardrobe-garments'
import { toStorageError } from '../storage/storage-error'
import {
  checkOutfit,
  cleanOutfitName,
  createOutfit,
  describeSlots,
  resolveOutfit,
} from './outfit.operations'
import { deleteOutfit as deleteSavedOutfit, putOutfit } from './outfit.repository'
import type { GarmentSelection } from './outfit.selection'
import type { Outfit } from './outfit.types'

/** Something about an outfit that the person needs to fix, worded to show them. */
export class OutfitError extends Error {}

function currentGarments(): Garment[] {
  return wardrobeGarments(useWardrobeStore.getState().uploads)
}

/** Runs a write on this device, unless this browser won't let Mydrobe save. */
async function persist(write: () => Promise<void>) {
  if (useWardrobeStore.getState().storage === 'unavailable') return
  try {
    await write()
  } catch (error) {
    throw toStorageError(error)
  }
}

/**
 * Saves what's on the mannequin, and its body shape, as a named outfit. Throws
 * an OutfitError or a StorageError with a message to show if it can't.
 */
export async function saveCurrentOutfit(name: string): Promise<Outfit> {
  const cleaned = cleanOutfitName(name)
  if (!cleaned) throw new OutfitError('Give the outfit a name.')
  const { selection, bodyPreset } = useWardrobeStore.getState()
  const check = checkOutfit(selection, bodyPreset, currentGarments())
  if (!check.ok) throw new OutfitError(check.problem)

  const outfit = createOutfit(cleaned, check.garmentIds, bodyPreset)
  await persist(() => putOutfit(outfit))
  const { addOutfit, showNotice } = useWardrobeStore.getState()
  addOutfit(outfit)
  showNotice('success', `Saved “${outfit.name}”`)
  return outfit
}

/** Gives a saved outfit a new name. Throws an OutfitError or a StorageError with a message to show. */
export async function renameOutfit(outfit: Outfit, name: string): Promise<Outfit> {
  const cleaned = cleanOutfitName(name)
  if (!cleaned) throw new OutfitError('Give the outfit a name.')
  if (cleaned === outfit.name) return outfit

  const renamed = { ...outfit, name: cleaned, updatedAt: Date.now() }
  await persist(() => putOutfit(renamed))
  useWardrobeStore.getState().replaceOutfit(renamed)
  return renamed
}

/** Deletes a saved outfit; its clothes stay in the wardrobe. Resolves to whether it went. */
export async function deleteOutfit(outfit: Outfit): Promise<boolean> {
  const { removeOutfit, showNotice } = useWardrobeStore.getState()
  try {
    await persist(() => deleteSavedOutfit(outfit.id))
  } catch {
    showNotice('error', `Couldn't delete “${outfit.name}” from this device. Please try again.`)
    return false
  }
  removeOutfit(outfit.id)
  showNotice('success', `Deleted “${outfit.name}”`)
  return true
}

/**
 * Puts a saved outfit back on the mannequin, on the body shape it was saved
 * with. Pieces that have left the wardrobe are skipped, and the person is told.
 */
export function wearOutfit(outfit: Outfit) {
  const { garments, missing } = resolveOutfit(outfit, currentGarments())
  const selection: GarmentSelection = {}
  for (const garment of garments) selection[garment.category] = garment.id
  const { dress, showNotice } = useWardrobeStore.getState()
  dress(selection, outfit.bodyPreset)
  if (missing.length > 0) {
    showNotice('error', `“${outfit.name}” is missing its ${describeSlots(missing)}, removed from your wardrobe.`)
  }
}
