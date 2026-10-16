import { PhotoMappingError, type PhotoAnalysis } from '../features/garments/photo-analysis'
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

/** Draws raw pixels onto a new canvas. */
export function pixelsToCanvas(pixels: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const imageData = new ImageData(pixels.width, pixels.height)
  imageData.data.set(pixels.data)
  canvas.getContext('2d')?.putImageData(imageData, 0, 0)
  return canvas
}

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  /** Frees the decoded pixels once they've been drawn. */
  release: () => void
}

/** Decodes an image file the right way up, following its camera orientation where supported. */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall back to an <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), type, quality)
  })
}

/** Redraws a photo at most `maxSide` pixels across, so a 12-megapixel upload doesn't hog memory. */
export async function downscaleImage(image: DecodedImage, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser has no 2D canvas to resize the photo with.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image.source, 0, 0, width, height)
  // WebP keeps transparency and is small; browsers that can't encode it fall back to PNG.
  return { blob: await canvasToBlob(canvas, 'image/webp', 0.9), width, height }
}

/**
 * A square thumbnail of just the garment, cut out of its background and
 * centred with a little room around it, like a shop's product shot.
 */
export async function cutOutThumbnail(analysis: Pick<PhotoAnalysis, 'image' | 'mask' | 'bounds'>, size = 360) {
  const { image, mask, bounds } = analysis
  const cutOut = new ImageData(bounds.width, bounds.height)
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const source = (bounds.y + y) * image.width + bounds.x + x
      if (!mask[source]) continue
      cutOut.data.set(image.data.subarray(source * 4, source * 4 + 4), (y * bounds.width + x) * 4)
    }
  }
  const piece = document.createElement('canvas')
  piece.width = bounds.width
  piece.height = bounds.height
  piece.getContext('2d')?.putImageData(cutOut, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser has no 2D canvas to draw the thumbnail with.')
  const scale = (size * 0.88) / Math.max(bounds.width, bounds.height)
  const width = bounds.width * scale
  const height = bounds.height * scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(piece, (size - width) / 2, (size - height) / 2, width, height)
  return canvasToBlob(canvas, 'image/webp', 0.85)
}
