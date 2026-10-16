import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { saveGarment } from '../garments/garment.repository'
import { addUploadedGarment, createUploadedGarment } from '../garments/garment.service'
import type { Garment } from '../garments/garment.types'
import { saveCurrentOutfit, wearOutfit } from '../outfits/outfit.service'
import { restoreSavedWardrobe } from './storage.service'

const initialState = useWardrobeStore.getState()

const navyShirt: Garment = {
  id: 'upload-navy-shirt',
  name: 'Navy shirt',
  category: 'shirt',
  templateId: 'shirt-long-sleeve',
  source: { kind: 'photo', url: 'blob:navy-shirt', backgroundTolerance: 70 },
  tags: ['upload'],
  createdAt: 1000,
  updatedAt: 1000,
}

describe('restoreSavedWardrobe', () => {
  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('brings back the clothes saved on this device, once per visit', async () => {
    await saveGarment(navyShirt, { photo: new Blob(['photo']), mimeType: 'image/jpeg', fileSize: 1000 })

    await restoreSavedWardrobe()
    await restoreSavedWardrobe()

    const { uploads, storage } = useWardrobeStore.getState()
    expect(storage).toBe('ready')
    expect(uploads.map((garment) => garment.name)).toEqual(['Navy shirt'])
  })

  it('keeps clothes and outfits across a reload, ready to wear again', async () => {
    // One visit: add a shirt, wear it with demo trousers on the large body, save the look.
    const shirt = createUploadedGarment({ url: 'blob:shirt' }, undefined, [[36, 55, 94]], {
      name: 'Navy shirt',
      category: 'shirt',
      templateId: 'shirt-long-sleeve',
      backgroundTolerance: 70,
    })
    await addUploadedGarment(shirt, { photo: new Blob(['photo'], { type: 'image/webp' }), mimeType: 'image/jpeg', fileSize: 1000 })
    useWardrobeStore.getState().wear([{ id: 'demo-indigo-denim', category: 'trousers' }])
    useWardrobeStore.getState().setBodyPreset('large')
    const saved = await saveCurrentOutfit('Weekend')

    // A reload: everything held in memory is gone, then the saved wardrobe is read back.
    useWardrobeStore.setState(initialState, true)
    await restoreSavedWardrobe()

    const { uploads, outfits } = useWardrobeStore.getState()
    expect(uploads.map((garment) => garment.name)).toEqual(['Navy shirt'])
    expect(outfits).toEqual([saved])
    wearOutfit(outfits[0])
    expect(useWardrobeStore.getState()).toMatchObject({
      selection: { shirt: shirt.id, trousers: 'demo-indigo-denim' },
      bodyPreset: 'large',
    })
  })

  it('carries on for this visit only when the browser will not let it save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(db, 'open').mockRejectedValue(new Error('IndexedDB is blocked'))

    await restoreSavedWardrobe()

    expect(useWardrobeStore.getState()).toMatchObject({ storage: 'unavailable', uploads: [] })
  })
})
