import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { saveGarment } from '../garments/garment.repository'
import type { Garment } from '../garments/garment.types'
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

  it('carries on for this visit only when the browser will not let it save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(db, 'open').mockRejectedValue(new Error('IndexedDB is blocked'))

    await restoreSavedWardrobe()

    expect(useWardrobeStore.getState()).toMatchObject({ storage: 'unavailable', uploads: [] })
  })
})
