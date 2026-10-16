import { useMemo } from 'react'
import type { Garment } from '../features/garments/garment.types'
import { wardrobeGarments } from '../features/garments/wardrobe-garments'
import { useWardrobeStore } from '../store/wardrobe.store'

/**
 * Everything in the wardrobe: the person's own uploads first, newest first,
 * then the built-in demo pieces.
 */
export function useWardrobeGarments(): Garment[] {
  const uploads = useWardrobeStore((state) => state.uploads)
  return useMemo(() => wardrobeGarments(uploads), [uploads])
}
