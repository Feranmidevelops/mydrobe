import { describe, expect, it } from 'vitest'
import {
  checkImageSize,
  checkUploadFile,
  readFileStart,
  sniffImageFormat,
  UPLOAD_LIMITS,
} from './garment.validation'

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

describe('checkUploadFile', () => {
  it('accepts a normal JPEG, PNG or WebP photo', () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      expect(checkUploadFile({ size: 2_000_000 }, format)).toBeNull()
    }
  })

  it('explains what to do with an iPhone HEIC photo', () => {
    expect(checkUploadFile({ size: 2_000_000 }, 'heic')).toMatch(/HEIC/)
  })

  it('turns away files that are not usable photos', () => {
    expect(checkUploadFile({ size: 2_000 }, 'unknown')).toMatch(/JPEG, PNG or WebP/)
    expect(checkUploadFile({ size: 2_000 }, 'gif')).toMatch(/JPEG, PNG or WebP/)
  })

  it('turns away files that are too big or empty', () => {
    expect(checkUploadFile({ size: UPLOAD_LIMITS.maxBytes + 1 }, 'jpeg')).toMatch(/over 15 MB/)
    expect(checkUploadFile({ size: 0 }, 'png')).toMatch(/empty/)
  })
})

describe('checkImageSize', () => {
  it('accepts an ordinary phone photo', () => {
    expect(checkImageSize(3024, 4032)).toBeNull()
  })

  it('turns away photos too small or too large to work with', () => {
    expect(checkImageSize(280, 900)).toMatch(/too small/)
    expect(checkImageSize(12_000, 900)).toMatch(/unusually large/)
  })
})
