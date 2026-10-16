import { db, imageRecordToBlob, toImageRecord, type GarmentRecord, type ImageRecord } from '../../lib/db'
import type { Garment } from './garment.types'

/** The files behind an upload, saved alongside its details. */
export interface GarmentFiles {
  /** The prepared photo that's mapped onto the mannequin. */
  photo: Blob
  thumbnail?: Blob
  /** The checked type and size of the file that was chosen. */
  mimeType: string
  fileSize: number
}

function toRecord(garment: Garment, files: GarmentFiles): GarmentRecord {
  if (garment.source.kind !== 'photo') throw new Error('Only uploaded garments are saved on the device.')
  return {
    id: garment.id,
    name: garment.name,
    category: garment.category,
    templateId: garment.templateId,
    tags: garment.tags,
    palette: garment.palette,
    createdAt: garment.createdAt,
    updatedAt: garment.updatedAt,
    imageKey: `${garment.id}/photo`,
    thumbnailKey: files.thumbnail ? `${garment.id}/thumbnail` : undefined,
    backgroundTolerance: garment.source.backgroundTolerance,
    mimeType: files.mimeType,
    fileSize: files.fileSize,
  }
}

function toGarment(record: GarmentRecord, photo: ImageRecord, thumbnail: ImageRecord | undefined): Garment {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    templateId: record.templateId,
    tags: record.tags,
    palette: record.palette,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: {
      kind: 'photo',
      url: URL.createObjectURL(imageRecordToBlob(photo)),
      thumbnailUrl: thumbnail ? URL.createObjectURL(imageRecordToBlob(thumbnail)) : undefined,
      backgroundTolerance: record.backgroundTolerance,
    },
  }
}

/** Saves an upload and its photos together, so a half-saved garment is never left behind. */
export async function saveGarment(garment: Garment, files: GarmentFiles) {
  const record = toRecord(garment, files)
  const images = await Promise.all([
    toImageRecord(record.imageKey, files.photo),
    ...(files.thumbnail && record.thumbnailKey ? [toImageRecord(record.thumbnailKey, files.thumbnail)] : []),
  ])
  await db.transaction('rw', db.garments, db.images, async () => {
    await db.images.bulkPut(images)
    await db.garments.put(record)
  })
}

/**
 * Reads the saved uploads, newest first, giving each photo an object URL.
 * Those URLs are revoked when the garment is removed.
 */
export async function loadGarments(): Promise<Garment[]> {
  const records = await db.garments.orderBy('createdAt').reverse().toArray()
  const keys = records.flatMap((record) =>
    record.thumbnailKey ? [record.imageKey, record.thumbnailKey] : [record.imageKey],
  )
  const images = new Map<string, ImageRecord>()
  for (const image of await db.images.bulkGet(keys)) if (image) images.set(image.id, image)

  return records.flatMap((record) => {
    const photo = images.get(record.imageKey)
    // Without its photo a garment can't be shown, so leave it out rather than show a broken card.
    if (!photo) return []
    return [toGarment(record, photo, record.thumbnailKey ? images.get(record.thumbnailKey) : undefined)]
  })
}

/** Deletes an upload and its photos from the device. */
export async function deleteGarment(id: string) {
  await db.transaction('rw', db.garments, db.images, async () => {
    const record = await db.garments.get(id)
    if (!record) return
    await db.images.bulkDelete(record.thumbnailKey ? [record.imageKey, record.thumbnailKey] : [record.imageKey])
    await db.garments.delete(id)
  })
}
