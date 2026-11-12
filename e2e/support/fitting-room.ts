import { expect, type Page } from '@playwright/test'
import type { GarmentRecord } from '../../src/lib/db.ts'
import { waitForFirstFrame } from './marks.ts'

/** The lazily loaded chunks in the production build. Rolldown's hashes can contain - and _. */
export const PAGE_CHUNK = /\/assets\/FittingRoomPage-[\w-]+\.js$/
/** The 3D viewer's file, including when the app asks for it again under a fresh address. */
export const VIEWER_CHUNK = /\/assets\/FittingRoom-[\w-]+\.js(\?.*)?$/

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const stage = (page: Page) => page.getByRole('region', { name: 'Fitting room', exact: true })
/** three.js tags its canvas with data-engine="three.js rNNN": proof a real WebGL renderer exists. */
export const stageCanvas = (page: Page) => stage(page).locator('canvas[data-engine^="three.js"]')
export const wardrobe = (page: Page) => page.getByRole('complementary', { name: 'Wardrobe' })
export const currentOutfit = (page: Page) => page.getByRole('region', { name: 'Current outfit' })
/**
 * Anchored, because "Take off X" and "Remove X from your wardrobe" contain the
 * name too. Pieces with no 3D template start with their "2D only" badge.
 */
export const garmentCard = (page: Page, name: string) =>
  wardrobe(page).getByRole('button', { name: new RegExp(`^(2D only )?${escapeRegExp(name)}`) })
export const preset = (page: Page, name: 'Small' | 'Medium' | 'Large') =>
  stage(page).getByRole('radiogroup', { name: 'Body preset' }).getByRole('radio', { name, exact: true })
export const cameraButton = (page: Page, name: 'Front' | 'Side' | 'Back') =>
  stage(page).getByRole('group', { name: 'Camera angle' }).getByRole('button', { name, exact: true })
export const resetCamera = (page: Page) => stage(page).getByRole('button', { name: 'Reset camera' })
/** Shown only once the saved wardrobe has been read and saving works. */
export const storageReady = (page: Page) => page.getByText('Everything you add is saved in this browser')
// The page always has empty role=alert and role=status regions, so always filter by text.
export const alertWith = (page: Page, text: string | RegExp) => page.getByRole('alert').filter({ hasText: text })
export const statusWith = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text })

/** Opens the fitting room and waits for the saved wardrobe and the 3D view. */
export async function openFittingRoom(page: Page, path = '/fitting-room') {
  await page.goto(path)
  await expect(storageReady(page)).toBeVisible()
  await expect(stage(page).getByText('Setting up the fitting room…')).toHaveCount(0)
  await expect(stageCanvas(page)).toBeVisible()
  await waitForFirstFrame(page)
}

/** Makes the page behave as if the browser had no WebGL, or only WebGL 1 with ['webgl2']. Survives reloads. */
export async function blockWebGL(page: Page, kinds = ['webgl', 'webgl2', 'experimental-webgl']) {
  await page.addInitScript((blocked: string[]) => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return blocked.includes(type) ? null : (original as (...args: unknown[]) => unknown).call(this, type, ...rest)
    } as typeof original
  }, kinds)
}

export interface SavedGarment {
  record: GarmentRecord
  photo: Buffer
  /** Saved under record.thumbnailKey, when the record has one. */
  thumbnail?: Buffer
}

/** A saved photo garment made from a test photo, as the app would store it after an upload. */
export function photoGarment(
  name: string,
  photo: { buffer: Buffer; mimeType: string },
  kind: 'shirt' | 'trousers',
  colour: string,
): SavedGarment {
  const id = `e2e-${name.toLowerCase().replace(/\W+/g, '-')}`
  const now = Date.now()
  return {
    record: {
      id,
      name,
      category: kind,
      templateId: kind === 'shirt' ? 'shirt-long-sleeve' : 'trousers-straight',
      tags: [],
      palette: [colour],
      createdAt: now,
      updatedAt: now,
      imageKey: `${id}-photo`,
      thumbnailKey: `${id}-thumbnail`,
      mimeType: photo.mimeType,
      fileSize: photo.buffer.length,
    },
    photo: photo.buffer,
    thumbnail: photo.buffer,
  }
}

/**
 * Writes garments and their photos straight into the saved wardrobe, as if
 * they had been added on an earlier visit. Call it once the saved wardrobe has
 * loaded: before that, opening the database would create an empty one.
 */
export async function seedGarments(page: Page, garments: SavedGarment[]) {
  await page.evaluate(
    async (garments) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('mydrobe')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        // Dexie's version 1 is IndexedDB version 10. Anything else means the schema moved on.
        if (db.version !== 10 || !db.objectStoreNames.contains('garments') || !db.objectStoreNames.contains('images')) {
          throw new Error(`Unexpected saved wardrobe: version ${db.version}`)
        }
        const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['garments', 'images'], 'readwrite')
          for (const { record, photo, thumbnail } of garments) {
            transaction.objectStore('images').put({ id: record.imageKey, bytes: bytes(photo), type: record.mimeType })
            if (thumbnail && record.thumbnailKey) {
              transaction.objectStore('images').put({ id: record.thumbnailKey, bytes: bytes(thumbnail), type: record.mimeType })
            }
            transaction.objectStore('garments').put(record)
          }
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
        })
      } finally {
        db.close()
      }
    },
    garments.map(({ record, photo, thumbnail }) => ({
      record,
      photo: photo.toString('base64'),
      thumbnail: thumbnail?.toString('base64'),
    })),
  )
}

/**
 * How many garments and outfits are saved on the device, read straight from
 * IndexedDB. Call it once the saved wardrobe has loaded: before that, opening
 * the database would create an empty one.
 */
export function savedCounts(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ garments: number; outfits: number }>((resolve, reject) => {
        const request = indexedDB.open('mydrobe')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction(['garments', 'outfits'], 'readonly')
          const garments = transaction.objectStore('garments').count()
          const outfits = transaction.objectStore('outfits').count()
          transaction.oncomplete = () => {
            db.close()
            resolve({ garments: garments.result, outfits: outfits.result })
          }
          transaction.onerror = () => {
            db.close()
            reject(transaction.error)
          }
        }
      }),
  )
}
