import { decodeImage, downscaleImage } from '../../lib/image-processing'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { forgetPhoto } from './analyse-photo'
import { toHex } from './garment.colors'
import type { Garment, GarmentCategory, GarmentTemplateId } from './garment.types'
import {
  checkImageSize,
  checkUploadFile,
  readFileStart,
  sniffImageFormat,
  type ImageFormat,
} from './garment.validation'
import type { Rgb } from './photo-mapping'

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

/** What the person chose about an upload on the review step. */
export interface GarmentDetails {
  name: string
  category: GarmentCategory
  templateId: GarmentTemplateId | null
  backgroundTolerance: number
}

function newGarmentId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function isUpload(garment: Garment) {
  return garment.tags.includes('upload')
}

/** Builds the wardrobe record for an uploaded photo. */
export function createUploadedGarment(
  photo: Pick<PreparedPhoto, 'url'>,
  thumbnailUrl: string | undefined,
  palette: Rgb[],
  details: GarmentDetails,
  now = Date.now(),
): Garment {
  return {
    id: newGarmentId(),
    name: details.name.trim() || 'Untitled piece',
    category: details.category,
    templateId: details.templateId,
    source: { kind: 'photo', url: photo.url, thumbnailUrl, backgroundTolerance: details.backgroundTolerance },
    tags: ['upload'],
    palette: palette.map(toHex),
    createdAt: now,
    updatedAt: now,
  }
}

function releaseUrl(url: string | undefined) {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

/** Takes an upload out of the wardrobe (and off the mannequin) and frees its photos. */
export function removeUploadedGarment(garment: Garment) {
  useWardrobeStore.getState().removeUpload(garment.id)
  if (garment.source.kind !== 'photo') return
  forgetPhoto(garment.source.url)
  releaseUrl(garment.source.url)
  releaseUrl(garment.source.thumbnailUrl)
}
