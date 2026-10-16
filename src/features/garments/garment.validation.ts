export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'gif' | 'unknown'

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

/**
 * Identifies an image from its first bytes rather than its file name or the
 * type the browser guessed, which are easy to get wrong.
 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat {
  const startsWith = (...values: number[]) => values.every((value, i) => bytes[i] === value)
  if (startsWith(0xff, 0xd8, 0xff)) return 'jpeg'
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif'
  const brand = ascii(bytes, 8, 4)
  if (ascii(bytes, 4, 4) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
    return 'heic'
  }
  return 'unknown'
}

/** Reads just enough of a file to identify it. */
export async function readFileStart(file: Blob, length = 16): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer())
}

export const UPLOAD_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  /** Below this on the shortest side there isn't enough detail to map. */
  minSide: 300,
  maxSide: 10_000,
} as const

export const SUPPORTED_FORMATS: ImageFormat[] = ['jpeg', 'png', 'webp']

/** Checks a file before decoding it. Returns a message to show, or null when it's fine. */
export function checkUploadFile(file: { size: number }, format: ImageFormat): string | null {
  if (format === 'heic') {
    return "iPhone HEIC photos aren't supported yet. Set the camera to “Most Compatible”, or share the photo as a JPEG."
  }
  if (!SUPPORTED_FORMATS.includes(format)) {
    return "That file isn't a photo we can use. Choose a JPEG, PNG or WebP image."
  }
  if (file.size > UPLOAD_LIMITS.maxBytes) return 'That photo is over 15 MB. Try a smaller copy of it.'
  if (file.size === 0) return 'That file is empty.'
  return null
}

/** Checks a decoded photo's size. Returns a message to show, or null when it's fine. */
export function checkImageSize(width: number, height: number): string | null {
  if (Math.min(width, height) < UPLOAD_LIMITS.minSide) {
    return `That photo is too small to use. It needs to be at least ${UPLOAD_LIMITS.minSide} pixels on its shortest side.`
  }
  if (Math.max(width, height) > UPLOAD_LIMITS.maxSide) {
    return 'That photo is unusually large. Try one under 10,000 pixels across.'
  }
  return null
}
