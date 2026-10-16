import { create } from 'zustand'
import type { Garment, GarmentCategory } from '../features/garments/garment.types'
import type { CameraView } from '../features/mannequin/camera-views'
import type { BodyPreset } from '../features/mannequin/viewer.types'
import {
  removeFromSelection,
  toggleInSelection,
  wearInSelection,
  type GarmentSelection,
} from '../features/outfits/outfit.selection'

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

let noticeCount = 0

interface WardrobeState {
  bodyPreset: BodyPreset
  selection: GarmentSelection
  viewRequest: ViewRequest | null
  /** The person's own clothes, newest first. */
  uploads: Garment[]
  storage: StorageStatus
  notice: Notice | null
  setBodyPreset: (preset: BodyPreset) => void
  toggleGarment: (garment: Pick<Garment, 'id' | 'category'>) => void
  /** Puts garments on without toggling, e.g. when opening a suggested look. */
  wear: (garments: Pick<Garment, 'id' | 'category'>[]) => void
  takeOff: (category: GarmentCategory) => void
  clearOutfit: () => void
  requestView: (view: ViewRequest['view']) => void
  addUpload: (garment: Garment) => void
  /** Removes an upload and takes it off the mannequin if it was being worn. */
  removeUpload: (id: string) => void
  setStorage: (storage: StorageStatus) => void
  /** Adds uploads read from the device after any added during this visit. */
  restoreUploads: (garments: Garment[]) => void
  showNotice: (kind: Notice['kind'], message: string) => void
  /** Clears the notice, unless a newer one has replaced it. */
  dismissNotice: (id: number) => void
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
  storage: 'idle',
  notice: null,
  setBodyPreset: (bodyPreset) => set({ bodyPreset }),
  toggleGarment: (garment) =>
    set((state) => ({ selection: toggleInSelection(state.selection, garment) })),
  wear: (garments) => set((state) => ({ selection: wearInSelection(state.selection, garments) })),
  takeOff: (category) =>
    set((state) => ({ selection: removeFromSelection(state.selection, category) })),
  clearOutfit: () => set({ selection: {} }),
  requestView: (view) =>
    set((state) => ({ viewRequest: { view, id: (state.viewRequest?.id ?? 0) + 1 } })),
  addUpload: (garment) => set((state) => ({ uploads: [garment, ...state.uploads] })),
  removeUpload: (id) =>
    set((state) => {
      const garment = state.uploads.find((upload) => upload.id === id)
      const worn = garment && state.selection[garment.category] === id
      return {
        uploads: state.uploads.filter((upload) => upload.id !== id),
        selection: worn ? removeFromSelection(state.selection, garment.category) : state.selection,
      }
    }),
  setStorage: (storage) => set({ storage }),
  restoreUploads: (garments) =>
    set((state) => {
      const known = new Set(state.uploads.map((upload) => upload.id))
      return { uploads: [...state.uploads, ...garments.filter((garment) => !known.has(garment.id))] }
    }),
  showNotice: (kind, message) => set({ notice: { id: ++noticeCount, kind, message } }),
  dismissNotice: (id) => set((state) => (state.notice?.id === id ? { notice: null } : {})),
}))
