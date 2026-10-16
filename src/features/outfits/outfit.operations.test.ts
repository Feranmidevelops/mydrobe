import { describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../garments/demo-garments'
import type { Garment } from '../garments/garment.types'
import type { BodyPreset } from '../mannequin/viewer.types'
import {
  checkOutfit,
  cleanOutfitName,
  createOutfit,
  isWearingOutfit,
  resolveOutfit,
  suggestOutfitName,
  withoutGarment,
} from './outfit.operations'

const garment = (id: string): Garment => {
  const found = DEMO_GARMENTS.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No demo garment ${id}`)
  return found
}

const shirt = garment('demo-oxford-stripe')
const trousers = garment('demo-indigo-denim')
const coat = garment('demo-camel-overcoat')

describe('suggestOutfitName', () => {
  it('offers the first look number that is free', () => {
    expect(suggestOutfitName([])).toBe('Look 1')
    expect(suggestOutfitName([{ name: 'Look 1' }, { name: 'look 2' }, { name: 'Weekend' }])).toBe('Look 3')
  })
})

describe('cleanOutfitName', () => {
  it('tidies spaces and keeps names to a sensible length', () => {
    expect(cleanOutfitName('  Friday   drinks ')).toBe('Friday drinks')
    expect(cleanOutfitName('x'.repeat(80))).toHaveLength(60)
  })

  it('turns away a name with nothing in it', () => {
    expect(cleanOutfitName('   ')).toBeNull()
  })
})

describe('checkOutfit', () => {
  it('keeps the pieces that are really in the wardrobe, in the right slots', () => {
    const check = checkOutfit(
      { shirt: shirt.id, trousers: trousers.id, outerwear: 'gone-for-good', shoes: shirt.id },
      'medium',
      DEMO_GARMENTS,
    )
    expect(check).toEqual({ ok: true, garmentIds: { shirt: shirt.id, trousers: trousers.id } })
  })

  it('needs at least one piece on the mannequin', () => {
    expect(checkOutfit({}, 'medium', DEMO_GARMENTS)).toEqual({ ok: false, problem: 'Put something on the mannequin first.' })
  })

  it('turns away a body shape it does not know', () => {
    expect(checkOutfit({ shirt: shirt.id }, 'huge' as BodyPreset, DEMO_GARMENTS)).toMatchObject({ ok: false })
  })
})

describe('resolveOutfit', () => {
  it('finds the pieces still in the wardrobe and names the slots that are not', () => {
    const outfit = {
      ...createOutfit('Look 1', { shirt: shirt.id, trousers: 'deleted-trousers', outerwear: coat.id }, 'large'),
      missingSlots: ['shoes' as const],
    }
    const resolved = resolveOutfit(outfit, DEMO_GARMENTS)
    expect(resolved.garments.map((piece) => piece.id)).toEqual([shirt.id, coat.id])
    expect(resolved.missing).toEqual(['trousers', 'shoes'])
  })
})

describe('withoutGarment', () => {
  it('marks the slot of a removed garment as missing', () => {
    const outfit = createOutfit('Look 1', { shirt: shirt.id, trousers: trousers.id }, 'medium', 1000)
    const updated = withoutGarment(outfit, shirt, 2000)

    expect(updated).toMatchObject({ garmentIds: { trousers: trousers.id }, missingSlots: ['shirt'], updatedAt: 2000 })
    expect(outfit.garmentIds).toEqual({ shirt: shirt.id, trousers: trousers.id })
  })

  it('leaves outfits that never had the garment alone', () => {
    const outfit = createOutfit('Look 1', { trousers: trousers.id }, 'medium')
    expect(withoutGarment(outfit, shirt)).toBe(outfit)
  })
})

describe('isWearingOutfit', () => {
  const outfit = createOutfit('Look 1', { shirt: shirt.id, trousers: trousers.id }, 'medium')

  it('recognises the mannequin wearing exactly this outfit', () => {
    expect(isWearingOutfit(outfit, { shirt: shirt.id, trousers: trousers.id }, 'medium', DEMO_GARMENTS)).toBe(true)
  })

  it('does not count a different body shape, a missing piece or an extra one', () => {
    expect(isWearingOutfit(outfit, { shirt: shirt.id, trousers: trousers.id }, 'large', DEMO_GARMENTS)).toBe(false)
    expect(isWearingOutfit(outfit, { shirt: shirt.id }, 'medium', DEMO_GARMENTS)).toBe(false)
    expect(
      isWearingOutfit(outfit, { shirt: shirt.id, trousers: trousers.id, outerwear: coat.id }, 'medium', DEMO_GARMENTS),
    ).toBe(false)
  })
})
