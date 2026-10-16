/**
 * Hand-picked pairings shown on the landing page: one hero piece, plus the
 * garment it's styled with so "Try the look" opens a complete outfit.
 */
export interface FeaturedLook {
  pieceId: string
  partnerId: string
}

export const FEATURED_LOOKS: FeaturedLook[] = [
  { pieceId: 'demo-oxford-stripe', partnerId: 'demo-stone-chinos' },
  { pieceId: 'demo-gingham', partnerId: 'demo-indigo-denim' },
  { pieceId: 'demo-linen-tee', partnerId: 'demo-black-trousers' },
]
