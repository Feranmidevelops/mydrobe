import { create } from 'zustand'
import type { Garment, GarmentCategory } from '../features/garments/garment.types'
import type { CameraView } from '../features/mannequin/camera-views'
import type { BodyPreset } from '../features/mannequin/viewer.types'
import {
  removeFromSelection,
  toggleInSelection,
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
  setBodyPreset: (preset: BodyPreset) => void
  toggleGarment: (garment: Pick<Garment, 'id' | 'category'>) => void
  takeOff: (category: GarmentCategory) => void
  clearOutfit: () => void
  requestView: (view: ViewRequest['view']) => void
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
  setBodyPreset: (bodyPreset) => set({ bodyPreset }),
  toggleGarment: (garment) =>
    set((state) => ({ selection: toggleInSelection(state.selection, garment) })),
  takeOff: (category) =>
    set((state) => ({ selection: removeFromSelection(state.selection, category) })),
  clearOutfit: () => set({ selection: {} }),
  requestView: (view) =>
    set((state) => ({ viewRequest: { view, id: (state.viewRequest?.id ?? 0) + 1 } })),
}))
