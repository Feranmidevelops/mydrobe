import { beforeEach, describe, expect, it } from 'vitest'
import { db, imageRecordToBlob, toImageRecord, type GarmentRecord } from './db'

const record: GarmentRecord = {
  id: 'upload-navy-shirt',
  name: 'Navy shirt',
  category: 'shirt',
  templateId: 'shirt-long-sleeve',
  tags: ['upload'],
  palette: ['#24375e'],
  imageKey: 'upload-navy-shirt/photo',
  backgroundTolerance: 70,
  mimeType: 'image/jpeg',
  fileSize: 2_000_000,
  createdAt: 1000,
  updatedAt: 1000,
}

describe('the on-device database', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('keeps garments and their photos as separate records', async () => {
    const photo = new Blob(['webp bytes'], { type: 'image/webp' })
    await db.images.put(await toImageRecord(record.imageKey, photo))
    await db.garments.put(record)

    expect(await db.garments.get(record.id)).toEqual(record)
    const stored = await db.images.get(record.imageKey)
    expect(stored?.type).toBe('image/webp')
    expect(await imageRecordToBlob(stored!).text()).toBe('webp bytes')
  })

  it('lists garments oldest first by when they were added', async () => {
    await db.garments.bulkPut([
      { ...record, id: 'later', createdAt: 3000 },
      { ...record, id: 'earlier', createdAt: 2000 },
    ])
    const ids = (await db.garments.orderBy('createdAt').toArray()).map((garment) => garment.id)
    expect(ids).toEqual(['earlier', 'later'])
  })
})
