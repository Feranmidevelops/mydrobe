import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { analysePhotoAt } from './analyse-photo'
import type { GarmentFiles } from './garment.repository'
import {
  addUploadedGarment,
  createUploadedGarment,
  discardPhoto,
  isUpload,
  makeThumbnail,
  preparePhoto,
  removeUploadedGarment,
  UploadError,
} from './garment.service'
import { createOutfit } from '../outfits/outfit.operations'
import { listOutfits, putOutfit } from '../outfits/outfit.repository'
import { StorageError } from '../storage/storage-error'

const file = (bytes: number[], name: string, size?: number) => {
  const content = new Uint8Array(size ?? bytes.length)
  content.set(bytes)
  return new File([content], name)
}

describe('preparePhoto', () => {
  it('turns away a file that only pretends to be a photo', async () => {
    const notes = new File(['shopping list'], 'shirt.jpg', { type: 'image/jpeg' })
    await expect(preparePhoto(notes)).rejects.toThrow(new UploadError("That file isn't a photo we can use. Choose a JPEG, PNG or WebP image."))
  })

  it('explains what to do with an iPhone HEIC photo', async () => {
    const heic = file([0, 0, 0, 0x18, ...'ftypheic'.split('').map((c) => c.charCodeAt(0))], 'IMG_0042.HEIC')
    await expect(preparePhoto(heic)).rejects.toThrow(/HEIC/)
  })

  it('turns away a photo over the size limit before decoding it', async () => {
    const huge = file([0xff, 0xd8, 0xff, 0xe0], 'huge.jpg', 16 * 1024 * 1024)
    await expect(preparePhoto(huge)).rejects.toThrow(/over 15 MB/)
  })
})

describe('uploaded garments', () => {
  const initialState = useWardrobeStore.getState()
  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  const details = {
    name: '  Navy shirt ',
    category: 'shirt' as const,
    templateId: 'shirt-long-sleeve' as const,
    backgroundTolerance: 70,
  }

  it('records the photo, palette and choices made on the review step', () => {
    const garment = createUploadedGarment({ url: 'blob:photo' }, 'blob:thumb', [[36, 55, 94], [240, 240, 240]], details, 1000)
    expect(garment).toMatchObject({
      name: 'Navy shirt',
      category: 'shirt',
      templateId: 'shirt-long-sleeve',
      source: { kind: 'photo', url: 'blob:photo', thumbnailUrl: 'blob:thumb', backgroundTolerance: 70 },
      palette: ['#24375e', '#f0f0f0'],
      createdAt: 1000,
    })
    expect(isUpload(garment)).toBe(true)
  })

  it('deletes a removed upload from the device, the wardrobe and the mannequin', async () => {
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [], details)
    await addUploadedGarment(garment, { photo: new Blob(['photo']), mimeType: 'image/jpeg', fileSize: 1000 })

    await expect(removeUploadedGarment(garment)).resolves.toBe(true)

    expect(await db.garments.count()).toBe(0)
    expect(useWardrobeStore.getState()).toMatchObject({
      uploads: [],
      selection: {},
      notice: { kind: 'success', message: 'Navy shirt removed from your wardrobe' },
    })
  })

  it('marks a removed upload as missing in the outfits saved on the device', async () => {
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [], details)
    await addUploadedGarment(garment, { photo: new Blob(['photo']), mimeType: 'image/jpeg', fileSize: 1000 })
    await putOutfit(createOutfit('Look 1', { shirt: garment.id, trousers: 'demo-indigo-denim' }, 'medium'))

    await removeUploadedGarment(garment)

    const [outfit] = await listOutfits()
    expect(outfit).toMatchObject({ garmentIds: { trousers: 'demo-indigo-denim' }, missingSlots: ['shirt'] })
  })

  it('keeps a piece the device would not delete, and says so', async () => {
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [], details)
    useWardrobeStore.getState().addUpload(garment)
    const deleting = vi.spyOn(db, 'transaction').mockImplementationOnce(() => Promise.reject(new Error('stuck')) as never)

    await expect(removeUploadedGarment(garment)).resolves.toBe(false)

    expect(useWardrobeStore.getState()).toMatchObject({
      uploads: [garment],
      notice: { kind: 'error', message: "Couldn't remove Navy shirt from this device. Please try again." },
    })
    deleting.mockRestore()
  })
})

describe('photo housekeeping', () => {
  it('forgets what was worked out about a discarded photo', () => {
    const load = vi.fn(() => new Promise<never>(() => {}))
    void analysePhotoAt('blob:discarded', load, 'trousers-straight', 70)
    void analysePhotoAt('blob:discarded', load, 'trousers-straight', 70)
    expect(load).toHaveBeenCalledTimes(1)

    discardPhoto('blob:discarded')
    void analysePhotoAt('blob:discarded', load, 'trousers-straight', 70)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('carries on without a thumbnail when one cannot be drawn', async () => {
    const analysis = {
      image: { data: new Uint8ClampedArray(16), width: 2, height: 2 },
      mask: new Uint8Array(4).fill(1),
      bounds: { x: 0, y: 0, width: 2, height: 2 },
    }
    await expect(makeThumbnail(analysis)).resolves.toBeUndefined()
  })
})

describe('addUploadedGarment', () => {
  const initialState = useWardrobeStore.getState()
  const files: GarmentFiles = { photo: new Blob(['photo']), mimeType: 'image/jpeg', fileSize: 2_000_000 }
  const details = {
    name: 'Navy shirt',
    category: 'shirt' as const,
    templateId: 'shirt-long-sleeve' as const,
    backgroundTolerance: 70,
  }

  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves it on the device, then adds it to the wardrobe and puts it on', async () => {
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [[36, 55, 94]], details)
    await addUploadedGarment(garment, files)

    expect(await db.garments.get(garment.id)).toMatchObject({ name: 'Navy shirt', mimeType: 'image/jpeg' })
    expect(useWardrobeStore.getState()).toMatchObject({
      uploads: [garment],
      selection: { shirt: garment.id },
      notice: { kind: 'success', message: 'Navy shirt added to your wardrobe' },
    })
  })

  it('leaves the wardrobe alone and explains when the device is out of space', async () => {
    const full = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' })
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => Promise.reject(full) as never)
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [], details)

    const failure = addUploadedGarment(garment, files)

    await expect(failure).rejects.toBeInstanceOf(StorageError)
    await expect(failure).rejects.toThrow(/enough space/)
    expect(useWardrobeStore.getState().uploads).toEqual([])
  })

  it('adds it for this visit only when the browser will not let it save', async () => {
    useWardrobeStore.setState({ storage: 'unavailable' })
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [], details)

    await addUploadedGarment(garment, files)

    expect(useWardrobeStore.getState().uploads).toEqual([garment])
    expect(await db.garments.count()).toBe(0)
  })
})
