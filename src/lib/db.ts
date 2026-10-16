import Dexie, { type EntityTable } from 'dexie'
import type { Garment } from '../features/garments/garment.types'
import type { Outfit } from '../features/outfits/outfit.types'

/**
 * An image kept on this device. It's stored as raw bytes rather than a Blob:
 * bytes copy reliably everywhere, while stored Blobs have been known to turn
 * unreadable in some versions of Safari.
 */
export interface ImageRecord {
  id: string
  bytes: ArrayBuffer
  type: string
}

/** A garment's details as saved on this device. Its photos live in the images table. */
export interface GarmentRecord extends Omit<Garment, 'source'> {
  /** The prepared photo, which is mapped onto the mannequin. */
  imageKey: string
  /** The cut-out shown on wardrobe cards. */
  thumbnailKey?: string
  backgroundTolerance?: number
  /** The type and size of the file that was chosen, as checked on upload. */
  mimeType: string
  fileSize: number
}

/** Everything Mydrobe keeps, all of it in this browser. Nothing is sent anywhere. */
export class MydrobeDatabase extends Dexie {
  declare garments: EntityTable<GarmentRecord, 'id'>
  declare images: EntityTable<ImageRecord, 'id'>
  declare outfits: EntityTable<Outfit, 'id'>

  constructor(name = 'mydrobe') {
    super(name)
    this.version(1).stores({
      garments: 'id, createdAt',
      images: 'id',
      outfits: 'id, createdAt',
    })
  }
}

export const db = new MydrobeDatabase()

export async function toImageRecord(id: string, blob: Blob): Promise<ImageRecord> {
  return { id, bytes: await blob.arrayBuffer(), type: blob.type }
}

export function imageRecordToBlob(record: Pick<ImageRecord, 'bytes' | 'type'>): Blob {
  return new Blob([record.bytes], { type: record.type })
}
