import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { StorageError } from '../storage/storage-error'
import { createOutfit } from './outfit.operations'
import { listOutfits, putOutfit } from './outfit.repository'
import { deleteOutfit, OutfitError, renameOutfit, saveCurrentOutfit, wearOutfit } from './outfit.service'

const initialState = useWardrobeStore.getState()
const shirt = 'demo-oxford-stripe'
const trousers = 'demo-indigo-denim'

describe('outfit service', () => {
  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('saves what is on the mannequin, with its body shape, on the device', async () => {
    useWardrobeStore.setState({ selection: { shirt, trousers }, bodyPreset: 'large' })

    const outfit = await saveCurrentOutfit('  Friday   drinks ')

    expect(outfit).toMatchObject({
      name: 'Friday drinks',
      garmentIds: { shirt, trousers },
      bodyPreset: 'large',
      missingSlots: [],
    })
    expect(await listOutfits()).toEqual([outfit])
    expect(useWardrobeStore.getState()).toMatchObject({
      outfits: [outfit],
      notice: { kind: 'success', message: 'Saved “Friday drinks”' },
    })
  })

  it('needs something on the mannequin and a name', async () => {
    await expect(saveCurrentOutfit('Look 1')).rejects.toThrow(new OutfitError('Put something on the mannequin first.'))
    useWardrobeStore.setState({ selection: { shirt } })
    await expect(saveCurrentOutfit('   ')).rejects.toThrow(new OutfitError('Give the outfit a name.'))

    expect(await listOutfits()).toEqual([])
  })

  it('leaves the saved outfits alone and explains when the device will not save', async () => {
    useWardrobeStore.setState({ selection: { shirt } })
    const saving = vi
      .spyOn(db.outfits, 'put')
      .mockImplementationOnce(() => Promise.reject(new Error('disk trouble')) as never)

    await expect(saveCurrentOutfit('Look 1')).rejects.toBeInstanceOf(StorageError)

    expect(useWardrobeStore.getState().outfits).toEqual([])
    saving.mockRestore()
  })

  it('renames a saved outfit on the device', async () => {
    const outfit = createOutfit('Look 1', { shirt }, 'medium', 1000)
    await putOutfit(outfit)
    useWardrobeStore.getState().addOutfit(outfit)

    const renamed = await renameOutfit(outfit, 'Office')

    expect(renamed).toMatchObject({ id: outfit.id, name: 'Office' })
    expect(await listOutfits()).toEqual([renamed])
    expect(useWardrobeStore.getState().outfits).toEqual([renamed])
    await expect(renameOutfit(renamed, ' ')).rejects.toThrow(new OutfitError('Give the outfit a name.'))
  })

  it('deletes a saved outfit and keeps its clothes', async () => {
    const outfit = createOutfit('Look 1', { shirt }, 'medium')
    await putOutfit(outfit)
    useWardrobeStore.getState().addOutfit(outfit)

    await expect(deleteOutfit(outfit)).resolves.toBe(true)

    expect(await listOutfits()).toEqual([])
    expect(useWardrobeStore.getState()).toMatchObject({
      outfits: [],
      notice: { kind: 'success', message: 'Deleted “Look 1”' },
    })
  })

  it('puts a saved outfit back on, on its body shape, and says which pieces have gone', () => {
    useWardrobeStore.setState({ selection: { outerwear: 'demo-camel-overcoat' }, bodyPreset: 'large' })
    const outfit = createOutfit('Look 1', { shirt, trousers: 'removed-trousers' }, 'small')

    wearOutfit(outfit)

    expect(useWardrobeStore.getState().selection).toEqual({ shirt })
    expect(useWardrobeStore.getState()).toMatchObject({
      bodyPreset: 'small',
      notice: { kind: 'error', message: '“Look 1” is missing its trousers, removed from your wardrobe.' },
    })
  })
})
