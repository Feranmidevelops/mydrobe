import { describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from './demo-garments'
import { getRenderability, templatesForCategory } from './garment.templates'

describe('getRenderability', () => {
  it('accepts a garment whose template matches its category', () => {
    const result = getRenderability({ category: 'shirt', templateId: 'shirt-long-sleeve' })
    expect(result.renderable).toBe(true)
    if (result.renderable) expect(result.template.id).toBe('shirt-long-sleeve')
  })

  it('rejects a template meant for another category', () => {
    const result = getRenderability({ category: 'trousers', templateId: 'shirt-short-sleeve' })
    expect(result).toEqual({
      renderable: false,
      reason: "The short-sleeve tee template doesn't fit a trousers item.",
    })
  })

  it('explains when a category has no template at all', () => {
    const result = getRenderability({ category: 'outerwear', templateId: null })
    expect(result).toEqual({
      renderable: false,
      reason: "There's no 3D template for outerwear yet.",
    })
  })

  it('asks for a template when one exists but none was chosen', () => {
    const result = getRenderability({ category: 'shirt', templateId: null })
    expect(result).toEqual({
      renderable: false,
      reason: 'No 3D template has been chosen for this item.',
    })
  })
})

describe('templatesForCategory', () => {
  it('lists both shirt templates and none for shoes', () => {
    expect(templatesForCategory('shirt').map((t) => t.id)).toEqual([
      'shirt-long-sleeve',
      'shirt-short-sleeve',
    ])
    expect(templatesForCategory('shoes')).toEqual([])
  })
})

describe('demo wardrobe', () => {
  it('has unique ids', () => {
    const ids = DEMO_GARMENTS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes renderable shirts and trousers plus one 2D-only item', () => {
    const renderable = DEMO_GARMENTS.filter((g) => getRenderability(g).renderable)
    expect(renderable.some((g) => g.category === 'shirt')).toBe(true)
    expect(renderable.some((g) => g.category === 'trousers')).toBe(true)
    expect(DEMO_GARMENTS.length - renderable.length).toBe(1)
  })
})
