import { DEMO_GARMENTS } from './demo-garments'
import type { Garment } from './garment.types'

/** Everything in the wardrobe: the person's own uploads first, then the demo pieces. */
export function wardrobeGarments(uploads: Garment[]): Garment[] {
  return [...uploads, ...DEMO_GARMENTS]
}
