import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { objectUrlBlobs } from '../../test/object-urls'
import { DEMO_GARMENTS } from './demo-garments'
import { deleteGarment, loadGarments, saveGarment, type GarmentFiles } from './garment.repository'
import type { Garment } from './garment.types'

function upload(id: string, createdAt: number): Garment {
  return {
    id,
    name: `Shirt ${id}`,
    category: 'shirt',
    templateId: 'shirt-long-sleeve',
    source: { kind: 'photo', url: `blob:${id}`, thumbnailUrl: `blob:${id}-thumbnail`, backgroundTolerance: 85 },
    tags: ['upload'],
    palette: ['#24375e'],
    createdAt,
    updatedAt: createdAt,
  }
}

const files = (label: string): GarmentFiles => ({
  photo: new Blob([`${label} photo`], { type: 'image/webp' }),
  thumbnail: new Blob([`${label} thumbnail`], { type: 'image/webp' }),
  mimeType: 'image/jpeg',
  fileSize: 2_000_000,
})

describe('garment repository', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('saves an upload with its photos and loads it back, newest first', async () => {
    await saveGarment(upload('older', 1000), files('older'))
    await saveGarment(upload('newer', 2000), files('newer'))

    const [newer, older] = await loadGarments()
    expect([newer.id, older.id]).toEqual(['newer', 'older'])
    expect(newer).toMatchObject({
      name: 'Shirt newer',
      category: 'shirt',
      templateId: 'shirt-long-sleeve',
      tags: ['upload'],
      palette: ['#24375e'],
      source: { kind: 'photo', backgroundTolerance: 85 },
    })
    if (newer.source.kind !== 'photo') throw new Error('expected a photo garment')
    expect(await objectUrlBlobs.get(newer.source.url)?.text()).toBe('newer photo')
    expect(await objectUrlBlobs.get(newer.source.thumbnailUrl!)?.text()).toBe('newer thumbnail')
    expect(await db.garments.get('newer')).toMatchObject({ mimeType: 'image/jpeg', fileSize: 2_000_000 })
  })

  it('deletes an upload together with its photos', async () => {
    await saveGarment(upload('gone', 1000), files('gone'))
    await deleteGarment('gone')

    expect(await loadGarments()).toEqual([])
    expect(await db.images.count()).toBe(0)
  })

  it('leaves out a saved garment whose photo has gone missing', async () => {
    await saveGarment(upload('broken', 1000), files('broken'))
    await db.images.delete('broken/photo')

    expect(await loadGarments()).toEqual([])
  })

  it('only saves uploads', async () => {
    await expect(saveGarment(DEMO_GARMENTS[0], files('demo'))).rejects.toThrow(/Only uploaded garments/)
  })
})
