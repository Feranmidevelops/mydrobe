import { crc32, deflateSync, inflateSync } from 'node:zlib'

/** RGBA pixels, four bytes each, row by row. */
export interface Pixels {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/*
 * Just enough PNG for the tests, with Node's own zlib and no extra dependency:
 * writing the generated garment photos, and reading canvas screenshots back.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type: string, body: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/** An opaque 8-bit RGB PNG; alpha is dropped. */
export function encodePng({ data, width, height }: Pixels): Buffer {
  const stride = width * 3 + 1 // each row starts with filter type 0 (none)
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4
      raw.set(data.subarray(from, from + 3), y * stride + 1 + x * 3)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Reads the 8-bit, non-interlaced RGB or RGBA PNGs that Chromium writes for
 * screenshots. Their pixel data can span several IDAT chunks, and optional
 * chunks (sRGB, pHYs and the like) are skipped.
 */
export function decodePng(png: Buffer): Pixels {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG')
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      colorType = body[9]
      if (body[8] !== 8 || body[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported PNG: bit depth ${body[8]}, colour type ${colorType}, interlace ${body[12]}`)
      }
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    } else if (type.charCodeAt(0) < 97) {
      // An upper-case first letter marks a critical chunk this reader doesn't know.
      throw new Error(`Unsupported PNG chunk ${type}`)
    }
    offset += length + 12
  }

  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(idat))
  const data = new Uint8Array(width * height * 4)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0
      const up = previous[i]
      const upLeft = i >= channels ? previous[i - channels] : 0
      const predictor =
        filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0
      row[i] = (line[i] + predictor) & 0xff
    }
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4
      const from = x * channels
      data[to] = row[from]
      data[to + 1] = row[from + 1]
      data[to + 2] = row[from + 2]
      data[to + 3] = channels === 4 ? row[from + 3] : 255
    }
    previous = row
  }
  return { width, height, data }
}
