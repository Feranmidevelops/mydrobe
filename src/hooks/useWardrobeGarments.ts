import { DEMO_GARMENTS } from '../features/garments/demo-garments'
import type { Garment } from '../features/garments/garment.types'

/**
 * The garments shown in the wardrobe. Returns the built-in demo set for now;
 * this is where IndexedDB-backed uploads will be merged in.
 */
export function useWardrobeGarments(): Garment[] {
  return DEMO_GARMENTS
}
