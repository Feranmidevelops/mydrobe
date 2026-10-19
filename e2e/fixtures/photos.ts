import { encodePng } from '../support/png.ts'
import { EXPECTED, shirtPhoto, trousersPhoto } from './garment-photos.ts'

/** The files the tests choose in the upload dialog, encoded once per test run. */
const png = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer })

export const PHOTOS = {
  shirt: png(EXPECTED.shirt.file, encodePng(shirtPhoto())),
  trousers: png(EXPECTED.trousers.file, encodePng(trousersPhoto())),
  /** Under the 300 px minimum on its short side. */
  tiny: png('tiny-shirt.png', encodePng(shirtPhoto({ width: 240, height: 293 }))),
  /** Called a PNG, but it isn't one. */
  notAPhoto: png('not-a-photo.png', Buffer.from('this is not an image')),
}
