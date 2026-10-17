import { db } from '../../lib/db'
import { mark, PERF_MARKS } from '../../lib/perf'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { loadGarments } from '../garments/garment.repository'
import { listOutfits } from '../outfits/outfit.repository'

/**
 * Reads what's saved on this device into the wardrobe, once per visit. If the
 * browser won't let Mydrobe save (some private modes block it), the wardrobe
 * still works, just for this visit.
 */
export async function restoreSavedWardrobe() {
  const { storage, setStorage, restoreUploads, restoreOutfits } = useWardrobeStore.getState()
  if (storage !== 'idle') return
  setStorage('loading')
  const started = performance.now()
  try {
    await db.open()
    const [uploads, outfits] = await Promise.all([loadGarments(), listOutfits()])
    restoreUploads(uploads)
    restoreOutfits(outfits)
    setStorage('ready')
    mark(PERF_MARKS.wardrobeReady, {
      storage: 'ready',
      uploads: uploads.length,
      outfits: outfits.length,
      ms: performance.now() - started,
    })
  } catch (error) {
    console.warn('Saving on this device is unavailable:', error)
    setStorage('unavailable')
    mark(PERF_MARKS.wardrobeReady, { storage: 'unavailable', ms: performance.now() - started })
  }
}
