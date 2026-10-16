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
