import { useMemo } from 'react'
import { DEMO_GARMENTS } from '../features/garments/demo-garments'
import type { Garment } from '../features/garments/garment.types'
import { useWardrobeStore } from '../store/wardrobe.store'

/**
 * Everything in the wardrobe: the person's own uploads first, newest first,
 * then the built-in demo pieces. Uploads last for this visit until saving
 * to IndexedDB arrives.
 */
export function useWardrobeGarments(): Garment[] {
  const uploads = useWardrobeStore((state) => state.uploads)
  return useMemo(() => [...uploads, ...DEMO_GARMENTS], [uploads])
}
