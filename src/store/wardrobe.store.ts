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

interface WardrobeState {
  bodyPreset: BodyPreset
  selection: GarmentSelection
  viewRequest: ViewRequest | null
  /** The person's own clothes, newest first. Kept for this visit only until saving arrives. */
  uploads: Garment[]
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
}))
