import { describe, expect, it } from 'vitest'
import { preparePhoto, UploadError } from './garment.service'

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
