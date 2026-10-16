import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { loadGarments } from '../garments/garment.repository'

/**
 * Reads what's saved on this device into the wardrobe, once per visit. If the
 * browser won't let Mydrobe save (some private modes block it), the wardrobe
 * still works, just for this visit.
 */
export async function restoreSavedWardrobe() {
  const { storage, setStorage, restoreUploads } = useWardrobeStore.getState()
  if (storage !== 'idle') return
  setStorage('loading')
  try {
    await db.open()
    restoreUploads(await loadGarments())
    setStorage('ready')
  } catch (error) {
    console.warn('Saving on this device is unavailable:', error)
    setStorage('unavailable')
  }
}
