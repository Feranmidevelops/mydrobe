import { create } from 'zustand'
import type { Garment, GarmentCategory } from '../features/garments/garment.types'
import type { CameraView } from '../features/mannequin/camera-views'
import type { BodyPreset } from '../features/mannequin/viewer.types'
import { withoutGarment } from '../features/outfits/outfit.operations'
import {
  removeFromSelection,
  toggleInSelection,
  wearInSelection,
  type GarmentSelection,
} from '../features/outfits/outfit.selection'
import type { Outfit } from '../features/outfits/outfit.types'

/** A one-off camera move; the id lets the same view be requested twice in a row. */
export interface ViewRequest {
  view: CameraView | 'reset'
  id: number
}

/**
 * Whether saving on this device works. It's unknown until the saved wardrobe
 * has been read, and "unavailable" means changes last for this visit only.
 */
export type StorageStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

/** A short message about something that just happened, shown for a moment. */
export interface Notice {
  id: number
  kind: 'success' | 'error'
  message: string
}

/** How fitting a photo onto the mannequin is going. */
export type FittingStatus = 'loading' | 'failed'

let noticeCount = 0

/** Adds records read from the device after any made during this visit, skipping ones already there. */
function mergeRestored<T extends { id: string }>(current: T[], restored: T[]): T[] {
  const known = new Set(current.map((item) => item.id))
  return [...current, ...restored.filter((item) => !known.has(item.id))]
}

interface WardrobeState {
  bodyPreset: BodyPreset
  selection: GarmentSelection
  viewRequest: ViewRequest | null
  /** The person's own clothes, newest first. */
  uploads: Garment[]
  /** Saved outfits, newest first. */
  outfits: Outfit[]
  storage: StorageStatus
  notice: Notice | null
  /** Photo garments still being fitted onto the mannequin, or that couldn't be, by id. */
  fitting: Record<string, FittingStatus>
  setBodyPreset: (preset: BodyPreset) => void
  toggleGarment: (garment: Pick<Garment, 'id' | 'category'>) => void
  /** Puts garments on without toggling, e.g. when opening a suggested look. */
  wear: (garments: Pick<Garment, 'id' | 'category'>[]) => void
  /** Replaces everything on the mannequin, and its body shape, e.g. to reopen a saved outfit. */
  dress: (selection: GarmentSelection, bodyPreset: BodyPreset) => void
  takeOff: (category: GarmentCategory) => void
  clearOutfit: () => void
  requestView: (view: ViewRequest['view']) => void
  addUpload: (garment: Garment) => void
  /**
   * Removes an upload, takes it off the mannequin if it was being worn and
   * marks it as missing in the saved outfits that used it.
   */
  removeUpload: (id: string) => void
  addOutfit: (outfit: Outfit) => void
  replaceOutfit: (outfit: Outfit) => void
  removeOutfit: (id: string) => void
  setStorage: (storage: StorageStatus) => void
  /** Adds uploads read from the device after any added during this visit. */
  restoreUploads: (garments: Garment[]) => void
  /** Adds outfits read from the device after any saved during this visit. */
  restoreOutfits: (outfits: Outfit[]) => void
  showNotice: (kind: Notice['kind'], message: string) => void
  /** Clears the notice, unless a newer one has replaced it. */
  dismissNotice: (id: number) => void
  /** Records how fitting a garment is going; null once it's on, or off the mannequin. */
  setFitting: (id: string, status: FittingStatus | null) => void
}

/**
 * UI state shared between the wardrobe panel and the 3D viewer. Camera
 * movement deliberately stays inside the viewer so rotation never re-renders
 * React components; the store only carries discrete view requests.
 */
export const useWardrobeStore = create<WardrobeState>()((set) => ({
  bodyPreset: 'medium',
  selection: {},
  viewRequest: null,
  uploads: [],
  outfits: [],
  storage: 'idle',
  notice: null,
  fitting: {},
  setBodyPreset: (bodyPreset) => set({ bodyPreset }),
  toggleGarment: (garment) =>
    set((state) => ({ selection: toggleInSelection(state.selection, garment) })),
  wear: (garments) => set((state) => ({ selection: wearInSelection(state.selection, garments) })),
  dress: (selection, bodyPreset) => set({ selection, bodyPreset }),
  takeOff: (category) =>
    set((state) => ({ selection: removeFromSelection(state.selection, category) })),
  clearOutfit: () => set({ selection: {} }),
  requestView: (view) =>
    set((state) => ({ viewRequest: { view, id: (state.viewRequest?.id ?? 0) + 1 } })),
  addUpload: (garment) => set((state) => ({ uploads: [garment, ...state.uploads] })),
  removeUpload: (id) =>
    set((state) => {
      const garment = state.uploads.find((upload) => upload.id === id)
      if (!garment) return {}
      const worn = state.selection[garment.category] === id
      return {
        uploads: state.uploads.filter((upload) => upload.id !== id),
        selection: worn ? removeFromSelection(state.selection, garment.category) : state.selection,
        outfits: state.outfits.map((outfit) => withoutGarment(outfit, garment)),
      }
    }),
  addOutfit: (outfit) => set((state) => ({ outfits: [outfit, ...state.outfits] })),
  replaceOutfit: (outfit) =>
    set((state) => ({ outfits: state.outfits.map((saved) => (saved.id === outfit.id ? outfit : saved)) })),
  removeOutfit: (id) => set((state) => ({ outfits: state.outfits.filter((outfit) => outfit.id !== id) })),
  setStorage: (storage) => set({ storage }),
  restoreUploads: (garments) => set((state) => ({ uploads: mergeRestored(state.uploads, garments) })),
  restoreOutfits: (outfits) => set((state) => ({ outfits: mergeRestored(state.outfits, outfits) })),
  showNotice: (kind, message) => set({ notice: { id: ++noticeCount, kind, message } }),
  dismissNotice: (id) => set((state) => (state.notice?.id === id ? { notice: null } : {})),
  setFitting: (id, status) =>
    set((state) => {
      if (status === null) {
        if (!(id in state.fitting)) return {}
        const fitting = { ...state.fitting }
        delete fitting[id]
        return { fitting }
      }
      return state.fitting[id] === status ? {} : { fitting: { ...state.fitting, [id]: status } }
    }),
}))
