import { beforeEach, describe, expect, it } from 'vitest'
import { useWardrobeStore } from './wardrobe.store'

const initialState = useWardrobeStore.getState()

describe('wardrobe store', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('starts on the medium preset with nothing worn', () => {
    expect(useWardrobeStore.getState()).toMatchObject({ bodyPreset: 'medium', selection: {} })
  })

  it('keeps the outfit intact while switching Small → Medium → Large', () => {
    const { toggleGarment, setBodyPreset } = useWardrobeStore.getState()
    toggleGarment({ id: 'demo-oxford-stripe', category: 'shirt' })
    toggleGarment({ id: 'demo-indigo-denim', category: 'trousers' })

    for (const preset of ['small', 'medium', 'large'] as const) {
      setBodyPreset(preset)
      expect(useWardrobeStore.getState()).toMatchObject({
        bodyPreset: preset,
        selection: { shirt: 'demo-oxford-stripe', trousers: 'demo-indigo-denim' },
      })
    }
  })

  it('takes off one category or clears the whole outfit', () => {
    const { toggleGarment, takeOff, clearOutfit } = useWardrobeStore.getState()
    toggleGarment({ id: 'demo-oxford-stripe', category: 'shirt' })
    toggleGarment({ id: 'demo-indigo-denim', category: 'trousers' })

    takeOff('shirt')
    expect(useWardrobeStore.getState().selection).toEqual({ trousers: 'demo-indigo-denim' })

    clearOutfit()
    expect(useWardrobeStore.getState().selection).toEqual({})
  })

  it('keeps uploads newest first and takes a removed one off the mannequin', () => {
    const { addUpload, removeUpload, toggleGarment } = useWardrobeStore.getState()
    const photo = (id: string, category: 'shirt' | 'trousers') => ({
      id,
      name: id,
      category,
      templateId: null,
      source: { kind: 'photo' as const, url: `blob:${id}` },
      tags: ['upload'],
      createdAt: 0,
      updatedAt: 0,
    })
    addUpload(photo('linen-shirt', 'shirt'))
    addUpload(photo('cord-trousers', 'trousers'))
    expect(useWardrobeStore.getState().uploads.map((garment) => garment.id)).toEqual(['cord-trousers', 'linen-shirt'])

    toggleGarment({ id: 'linen-shirt', category: 'shirt' })
    toggleGarment({ id: 'demo-indigo-denim', category: 'trousers' })
    removeUpload('linen-shirt')

    expect(useWardrobeStore.getState().uploads.map((garment) => garment.id)).toEqual(['cord-trousers'])
    expect(useWardrobeStore.getState().selection).toEqual({ trousers: 'demo-indigo-denim' })
  })
})
