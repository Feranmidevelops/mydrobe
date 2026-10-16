import { beforeEach, describe, expect, it } from 'vitest'
import { useWardrobeStore } from '../../store/wardrobe.store'
import {
  createUploadedGarment,
  isUpload,
  preparePhoto,
  removeUploadedGarment,
  UploadError,
} from './garment.service'

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
  beforeEach(() => useWardrobeStore.setState(initialState, true))

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

  it('takes a removed upload out of the wardrobe and off the mannequin', () => {
    const garment = createUploadedGarment({ url: 'blob:photo' }, undefined, [], details)
    useWardrobeStore.getState().addUpload(garment)
    useWardrobeStore.getState().wear([garment])

    removeUploadedGarment(garment)

    expect(useWardrobeStore.getState().uploads).toEqual([])
    expect(useWardrobeStore.getState().selection).toEqual({})
  })
})
