import { create } from 'zustand'
import type { Garment, GarmentCategory } from '../features/garments/garment.types'
import type { BodyPreset } from '../features/mannequin/viewer.types'
import {
  removeFromSelection,
  toggleInSelection,
  type GarmentSelection,
} from '../features/outfits/outfit.selection'

interface WardrobeState {
  bodyPreset: BodyPreset
  selection: GarmentSelection
  setBodyPreset: (preset: BodyPreset) => void
  toggleGarment: (garment: Pick<Garment, 'id' | 'category'>) => void
  takeOff: (category: GarmentCategory) => void
  clearOutfit: () => void
}

/**
 * UI state shared between the wardrobe panel and the 3D viewer. Camera
 * movement deliberately stays inside the viewer so rotation never re-renders
 * React components.
 */
export const useWardrobeStore = create<WardrobeState>()((set) => ({
  bodyPreset: 'medium',
  selection: {},
  setBodyPreset: (bodyPreset) => set({ bodyPreset }),
  toggleGarment: (garment) =>
    set((state) => ({ selection: toggleInSelection(state.selection, garment) })),
  takeOff: (category) =>
    set((state) => ({ selection: removeFromSelection(state.selection, category) })),
  clearOutfit: () => set({ selection: {} }),
}))
