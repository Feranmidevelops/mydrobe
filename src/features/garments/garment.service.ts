import { decodeImage, downscaleImage } from '../../lib/image-processing'
import {
  checkImageSize,
  checkUploadFile,
  readFileStart,
  sniffImageFormat,
  type ImageFormat,
} from './garment.validation'

/** A problem with an upload, worded to show to the person who chose the file. */
export class UploadError extends Error {}

/** An uploaded photo after checking and resizing, ready to analyse. */
export interface PreparedPhoto {
  /** Object URL of the resized photo; revoke it when the photo is discarded. */
  url: string
  blob: Blob
  width: number
  height: number
  format: ImageFormat
  fileName: string
  fileSize: number
}

/**
 * Checks a chosen file and turns it into a working photo: confirms it really
 * is a supported image (by its bytes, not its name), decodes it the right
 * way up, checks its size and scales it down.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const format = sniffImageFormat(await readFileStart(file))
  const fileProblem = checkUploadFile(file, format)
  if (fileProblem) throw new UploadError(fileProblem)

  const image = await decodeImage(file).catch(() => {
    throw new UploadError("That photo couldn't be opened. It may be damaged, so try another copy.")
  })
  try {
    const sizeProblem = checkImageSize(image.width, image.height)
    if (sizeProblem) throw new UploadError(sizeProblem)
    const { blob, width, height } = await downscaleImage(image)
    return {
      url: URL.createObjectURL(blob),
      blob,
      width,
      height,
      format,
      fileName: file.name,
      fileSize: file.size,
    }
  } finally {
    image.release()
  }
}
