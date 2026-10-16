import { describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../garments/demo-garments'
import { getRenderability } from '../garments/garment.templates'
import { FEATURED_LOOKS } from './featured-looks'

const byId = new Map(DEMO_GARMENTS.map((garment) => [garment.id, garment]))

describe('featured looks', () => {
  it.each(FEATURED_LOOKS)('pairs $pieceId with $partnerId as a wearable outfit', (look) => {
    const piece = byId.get(look.pieceId)
    const partner = byId.get(look.partnerId)

    expect(piece).toBeDefined()
    expect(partner).toBeDefined()
    expect(piece!.category).not.toBe(partner!.category)
    expect(getRenderability(piece!).renderable).toBe(true)
    expect(getRenderability(partner!).renderable).toBe(true)
  })
})
