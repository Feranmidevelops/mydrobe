import { describe, expect, it } from 'vitest'
import type { FabricPattern } from '../features/garments/garment.types'
import { drawFabric } from './fabric'

/** A stand-in 2D context drawing at `pixelsPerMm`, counting the rectangles it's asked to fill. */
function fakeContext(pixelsPerMm: number) {
  const fills: number[][] = []
  const ctx = {
    fillStyle: '',
    getTransform: () => ({ a: pixelsPerMm, b: 0, c: 0, d: pixelsPerMm, e: 0, f: 0 }),
    fillRect: (...rect: number[]) => fills.push(rect),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

// The densest flecks of any fabric: one per 6 mm².
const WOOL: FabricPattern = { kind: 'solid', color: '#b98a5e', finish: 'wool' }

describe('drawFabric', () => {
  it('draws flecks only where they are big enough to see', () => {
    // A wardrobe card shows 600 mm of fabric across about 270 device pixels.
    const card = fakeContext(0.45)
    drawFabric(card.ctx, WOOL, 600, 600)
    expect(card.fills, 'just the cloth, no flecks').toHaveLength(1)

    // The 3D garment textures draw 1.6 px per mm, where the flecks show.
    const texture = fakeContext(1.6)
    drawFabric(texture.ctx, WOOL, 600, 600)
    expect(texture.fills.length).toBeGreaterThan(50_000)
  })
})
