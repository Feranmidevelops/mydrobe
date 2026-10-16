import { cutOutThumbnail, decodeImage, downscaleImage } from '../../lib/image-processing'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { toStorageError } from '../storage/storage-error'
import { forgetPhoto } from './analyse-photo'
import { toHex } from './garment.colors'
import { deleteGarment, saveGarment, type GarmentFiles } from './garment.repository'
import { getRenderability } from './garment.templates'
import type { Garment, GarmentCategory, GarmentTemplateId } from './garment.types'
import {
  checkImageSize,
  checkUploadFile,
  readFileStart,
  sniffImageFormat,
  type ImageFormat,
} from './garment.validation'
import type { PhotoAnalysis } from './photo-analysis'
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

/** The garment's cut-out thumbnail, or undefined when one can't be drawn. */
export async function makeThumbnail(analysis: Pick<PhotoAnalysis, 'image' | 'mask' | 'bounds'>) {
  try {
    return await cutOutThumbnail(analysis)
  } catch {
    // Wardrobe cards fall back to the full photo.
    return undefined
  }
}

/**
 * Saves a reviewed upload on this device, then adds it to the wardrobe and
 * puts it on the mannequin when it can be worn. The wardrobe only changes
 * once the save has worked, so a failed save can simply be tried again.
 */
export async function addUploadedGarment(garment: Garment, files: GarmentFiles) {
  if (useWardrobeStore.getState().storage !== 'unavailable') {
    try {
      await saveGarment(garment, files)
    } catch (error) {
      throw toStorageError(error)
    }
  }
  const { addUpload, wear, showNotice } = useWardrobeStore.getState()
  addUpload(garment)
  if (getRenderability(garment).renderable) wear([garment])
  showNotice('success', `${garment.name} added to your wardrobe`)
}

/** Lets go of a photo nothing will show again: its object URL and any remembered analyses. */
export function discardPhoto(url: string | undefined) {
  if (!url) return
  forgetPhoto(url)
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

/**
 * Deletes an upload from this device, then takes it out of the wardrobe (and
 * off the mannequin) and frees its photos. If the device won't delete it, the
 * piece stays and the person is told. Resolves to whether it was removed.
 */
export async function removeUploadedGarment(garment: Garment) {
  const { storage, showNotice } = useWardrobeStore.getState()
  if (storage !== 'unavailable') {
    try {
      await deleteGarment(garment.id)
    } catch {
      showNotice('error', `Couldn't remove ${garment.name} from this device. Please try again.`)
      return false
    }
  }
  useWardrobeStore.getState().removeUpload(garment.id)
  if (garment.source.kind === 'photo') {
    discardPhoto(garment.source.url)
    discardPhoto(garment.source.thumbnailUrl)
  }
  showNotice('success', `${garment.name} removed from your wardrobe`)
  return true
}
