import { PhotoMappingError } from '../features/garments/photo-analysis'
import type { RgbaImage } from '../features/garments/photo-mapping'
import { loadImage } from './load-image'

/** Photos are scaled down to this many pixels on their long side before analysis. */
export const ANALYSIS_MAX_PX = 1200

/** Loads a photo and reads its pixels, scaled down for quick analysis. */
export async function loadPhotoPixels(url: string): Promise<RgbaImage> {
  const image = await loadImage(url).catch(() => {
    throw new PhotoMappingError("This photo couldn't be loaded.")
  })
  const scale = Math.min(1, ANALYSIS_MAX_PX / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new PhotoMappingError('This browser has no 2D canvas to read the photo with.')
  ctx.drawImage(image, 0, 0, width, height)
  return { data: ctx.getImageData(0, 0, width, height).data, width, height }
}
