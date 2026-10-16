import { describe, expect, it } from 'vitest'
import { colorName, extractPalette, suggestGarmentName, toHex } from './garment.colors'
import type { Rgb } from './photo-mapping'

describe('colorName', () => {
  it.each([
    [[36, 55, 94], 'navy'],
    [[17, 18, 12], 'black'],
    [[205, 208, 214], 'white'],
    [[128, 128, 130], 'grey'],
    [[156, 175, 148], 'sage'],
    [[200, 181, 147], 'beige'],
    [[95, 60, 35], 'brown'],
    [[63, 28, 29], 'burgundy'],
    [[190, 40, 45], 'red'],
    [[70, 110, 190], 'blue'],
    [[85, 90, 40], 'olive'],
  ] as [Rgb, string][])('calls %j %s', (rgb, name) => {
    expect(colorName(rgb)).toBe(name)
  })
})

describe('toHex', () => {
  it('writes a colour as a CSS hex string', () => {
    expect(toHex([36, 55, 94])).toBe('#24375e')
  })
})

describe('extractPalette', () => {
  it('lists the main colours, most common first, leaving out tiny accents', () => {
    const width = 50
    const data = new Uint8ClampedArray(width * width * 4)
    const mask = new Uint8Array(width * width).fill(1)
    for (let i = 0; i < width * width; i++) {
      const x = i % width
      const color: Rgb = x < 30 ? [36, 55, 94] : x < 48 ? [240, 240, 240] : [200, 30, 30]
      data.set([...color, 255], i * 4)
    }
    const palette = extractPalette({ data, width, height: width }, mask, { x: 0, y: 0, width, height: width })
    expect(palette).toEqual([
      [36, 55, 94],
      [240, 240, 240],
    ])
  })
})

describe('suggestGarmentName', () => {
  it('combines the main colour with the kind of garment', () => {
    expect(suggestGarmentName([36, 55, 94], 'shirt', 'shirt-long-sleeve')).toBe('Navy shirt')
    expect(suggestGarmentName([205, 208, 214], 'shirt', 'shirt-short-sleeve')).toBe('White tee')
    expect(suggestGarmentName([200, 181, 147], 'trousers', 'trousers-straight')).toBe('Beige trousers')
  })

  it('falls back to just the kind of garment without a colour', () => {
    expect(suggestGarmentName(undefined, 'outerwear', null)).toBe('Jacket')
  })
})
