import { describe, expect, it } from 'vitest'
import { readFileStart, sniffImageFormat } from './garment.validation'

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === 'string' ? [...value].map((c) => c.charCodeAt(0)) : [value])))

describe('sniffImageFormat', () => {
  it.each([
    ['JPEG', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'JFIF'), 'jpeg'],
    ['PNG', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d), 'png'],
    ['WebP', bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 '), 'webp'],
    ['GIF', bytes('GIF89a', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), 'gif'],
    ['iPhone HEIC', bytes(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0), 'heic'],
    ['a text file', bytes('hello, world....'), 'unknown'],
  ])('recognises %s', (_, data, format) => {
    expect(sniffImageFormat(data)).toBe(format)
  })

  it('ignores a misleading file name', async () => {
    const renamed = new File([bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)], 'holiday.jpg', { type: 'image/jpeg' })
    expect(sniffImageFormat(await readFileStart(renamed))).toBe('png')
  })
})
