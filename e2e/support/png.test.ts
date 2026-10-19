import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodePng, encodePng } from './png.ts'

function checkerboard(width: number, height: number) {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const dark = (i % width) % 2 === Math.floor(i / width) % 2
    data.set(dark ? [30, 64, 175, 255] : [238, 234, 226, 255], i * 4)
  }
  return { width, height, data }
}

describe('png', () => {
  it('reads back exactly what it wrote', () => {
    const image = checkerboard(7, 5)
    expect(decodePng(encodePng(image))).toEqual(image)
  })

  it('reads RGBA pixel data split over several IDAT chunks, skipping optional chunks', () => {
    const image = checkerboard(6, 4)
    const encoded = encodePng(image)
    // Rebuild the file as RGBA with an sRGB chunk and the data cut into three IDATs.
    const rows = Buffer.alloc((6 * 4 + 1) * 4)
    for (let y = 0; y < 4; y++) rows.set(image.data.subarray(y * 24, (y + 1) * 24), y * 25 + 1)
    const compressed = deflateSync(rows)
    const parts = [compressed.subarray(0, 5), compressed.subarray(5, 11), compressed.subarray(11)]
    const chunk = (type: string, body: Buffer) => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(body.length)
      return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)])
    }
    const header = Buffer.from(encoded.subarray(16, 29))
    header[9] = 6
    const rgba = Buffer.concat([
      encoded.subarray(0, 8),
      chunk('IHDR', header),
      chunk('sRGB', Buffer.from([0])),
      ...parts.map((part) => chunk('IDAT', Buffer.from(part))),
      chunk('IEND', Buffer.alloc(0)),
    ])
    expect(decodePng(rgba)).toEqual(image)
  })

  it('refuses anything that is not a PNG', () => {
    expect(() => decodePng(Buffer.from('not an image'))).toThrow('Not a PNG')
  })
})
