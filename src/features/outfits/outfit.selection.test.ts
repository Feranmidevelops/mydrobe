import { describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../garments/demo-garments'
import { resolveSelection, toggleInSelection, wearInSelection } from './outfit.selection'

const oxford = { id: 'demo-oxford-stripe', category: 'shirt' } as const
const gingham = { id: 'demo-gingham', category: 'shirt' } as const
const denim = { id: 'demo-indigo-denim', category: 'trousers' } as const

describe('toggleInSelection', () => {
  it('adds garments from different categories side by side', () => {
    const selection = toggleInSelection(toggleInSelection({}, oxford), denim)
    expect(selection).toEqual({ shirt: oxford.id, trousers: denim.id })
  })

  it('replaces the garment already worn in the same category', () => {
    expect(toggleInSelection({ shirt: oxford.id }, gingham)).toEqual({ shirt: gingham.id })
  })

  it('takes off a garment that is selected again', () => {
    expect(toggleInSelection({ shirt: oxford.id, trousers: denim.id }, oxford)).toEqual({
      trousers: denim.id,
    })
  })

  it('does not mutate the previous selection', () => {
    const before = { shirt: oxford.id }
    toggleInSelection(before, gingham)
    expect(before).toEqual({ shirt: oxford.id })
  })
})

describe('wearInSelection', () => {
  it('puts on a whole look, replacing items in the same categories', () => {
    expect(wearInSelection({ shirt: gingham.id, outerwear: 'demo-camel-overcoat' }, [oxford, denim])).toEqual({
      shirt: oxford.id,
      trousers: denim.id,
      outerwear: 'demo-camel-overcoat',
    })
  })

  it('keeps a garment on when it is worn again', () => {
    expect(wearInSelection({ shirt: oxford.id }, [oxford])).toEqual({ shirt: oxford.id })
  })
})

describe('resolveSelection', () => {
  it('returns worn garments in category order with renderability', () => {
    const worn = resolveSelection(
      { outerwear: 'demo-camel-overcoat', trousers: denim.id, shirt: oxford.id },
      DEMO_GARMENTS,
    )
    expect(worn.map((w) => w.garment.id)).toEqual([oxford.id, denim.id, 'demo-camel-overcoat'])
    expect(worn.map((w) => w.renderability.renderable)).toEqual([true, true, false])
  })

  it('drops ids that no longer exist in the wardrobe', () => {
    expect(resolveSelection({ shirt: 'deleted-garment', trousers: denim.id }, DEMO_GARMENTS)).toHaveLength(1)
  })

  it('drops an id stored under the wrong category', () => {
    expect(resolveSelection({ trousers: oxford.id }, DEMO_GARMENTS)).toEqual([])
  })
})
