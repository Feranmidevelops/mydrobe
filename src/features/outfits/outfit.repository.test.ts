import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { createOutfit } from './outfit.operations'
import { deleteOutfit, listOutfits, putOutfit, removeGarmentFromOutfits } from './outfit.repository'

describe('outfit repository', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('lists saved outfits newest first, and keeps changes to them', async () => {
    const older = createOutfit('Look 1', { shirt: 'demo-oxford-stripe' }, 'small', 1000)
    const newer = createOutfit('Look 2', { trousers: 'demo-indigo-denim' }, 'large', 2000)
    await putOutfit(older)
    await putOutfit(newer)
    await putOutfit({ ...older, name: 'Office', updatedAt: 3000 })

    expect(await listOutfits()).toEqual([newer, { ...older, name: 'Office', updatedAt: 3000 }])
  })

  it('deletes an outfit', async () => {
    const outfit = createOutfit('Look 1', { shirt: 'demo-oxford-stripe' }, 'medium')
    await putOutfit(outfit)
    await deleteOutfit(outfit.id)

    expect(await listOutfits()).toEqual([])
  })

  it('marks a removed garment as missing only in the outfits that used it', async () => {
    const withShirt = createOutfit('With shirt', { shirt: 'upload-shirt', trousers: 'demo-indigo-denim' }, 'medium', 1000)
    const without = createOutfit('Without', { shirt: 'demo-oxford-stripe' }, 'medium', 2000)
    await putOutfit(withShirt)
    await putOutfit(without)

    await removeGarmentFromOutfits({ id: 'upload-shirt', category: 'shirt' }, 5000)

    const [stillWithout, nowMissing] = await listOutfits()
    expect(stillWithout).toEqual(without)
    expect(nowMissing).toMatchObject({
      garmentIds: { trousers: 'demo-indigo-denim' },
      missingSlots: ['shirt'],
      updatedAt: 5000,
    })
  })
})
