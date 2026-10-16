import { beforeEach, describe, expect, it } from 'vitest'
import { createOutfit } from '../features/outfits/outfit.operations'
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

  it('puts uploads read from the device after ones added during this visit, without doubling up', () => {
    const { addUpload, restoreUploads } = useWardrobeStore.getState()
    const photo = (id: string) => ({
      id,
      name: id,
      category: 'shirt' as const,
      templateId: null,
      source: { kind: 'photo' as const, url: `blob:${id}` },
      tags: ['upload'],
      createdAt: 0,
      updatedAt: 0,
    })
    addUpload(photo('just-added'))
    restoreUploads([photo('just-added'), photo('saved-earlier')])

    expect(useWardrobeStore.getState().uploads.map((garment) => garment.id)).toEqual(['just-added', 'saved-earlier'])
  })

  it('keeps saved outfits newest first and lets them be renamed, reopened and deleted', () => {
    const { addOutfit, replaceOutfit, removeOutfit, dress } = useWardrobeStore.getState()
    const older = createOutfit('Look 1', { shirt: 'demo-oxford-stripe' }, 'small', 1000)
    const newer = createOutfit('Look 2', { trousers: 'demo-indigo-denim' }, 'large', 2000)
    addOutfit(older)
    addOutfit(newer)
    replaceOutfit({ ...older, name: 'Office' })
    expect(useWardrobeStore.getState().outfits.map((outfit) => outfit.name)).toEqual(['Look 2', 'Office'])

    dress(older.garmentIds, older.bodyPreset)
    expect(useWardrobeStore.getState()).toMatchObject({ selection: older.garmentIds, bodyPreset: 'small' })

    removeOutfit(newer.id)
    expect(useWardrobeStore.getState().outfits.map((outfit) => outfit.name)).toEqual(['Office'])
  })

  it('marks a removed upload as missing in the saved outfits that used it', () => {
    const { addUpload, addOutfit, removeUpload } = useWardrobeStore.getState()
    addUpload({
      id: 'linen-shirt',
      name: 'Linen shirt',
      category: 'shirt',
      templateId: null,
      source: { kind: 'photo', url: 'blob:linen-shirt' },
      tags: ['upload'],
      createdAt: 0,
      updatedAt: 0,
    })
    addOutfit(createOutfit('Look 1', { shirt: 'linen-shirt', trousers: 'demo-indigo-denim' }, 'medium'))

    removeUpload('linen-shirt')

    expect(useWardrobeStore.getState().outfits[0]).toMatchObject({
      garmentIds: { trousers: 'demo-indigo-denim' },
      missingSlots: ['shirt'],
    })
  })

  it('shows one notice at a time and only clears the one it was asked to', () => {
    const { showNotice, dismissNotice } = useWardrobeStore.getState()
    showNotice('success', 'Navy shirt added to your wardrobe')
    const first = useWardrobeStore.getState().notice!
    showNotice('error', "Couldn't save it on this device")
    const second = useWardrobeStore.getState().notice!

    dismissNotice(first.id)
    expect(useWardrobeStore.getState().notice).toEqual(second)
    dismissNotice(second.id)
    expect(useWardrobeStore.getState().notice).toBeNull()
  })
})
