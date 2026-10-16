import { describe, expect, it } from 'vitest'
import { fabricBaseColor } from '../../lib/fabric'
import { DEMO_GARMENTS } from '../garments/demo-garments'
import type { Garment } from '../garments/garment.types'
import { PHOTO_PLACEHOLDER_COLOR, placeholderColor } from './placeholder-color'

const upload: Garment = {
  id: 'upload-navy-shirt',
  name: 'Navy shirt',
  category: 'shirt',
  templateId: 'shirt-long-sleeve',
  source: { kind: 'photo', url: 'blob:navy-shirt' },
  tags: ['upload'],
  createdAt: 0,
  updatedAt: 0,
}

describe('placeholderColor', () => {
  it('uses the main colour of an uploaded photo', () => {
    expect(placeholderColor({ ...upload, palette: ['#24375e', '#f0f0f0'] })).toBe('#24375e')
  })

  it('falls back to a neutral colour when the photo colour is unknown', () => {
    expect(placeholderColor(upload)).toBe(PHOTO_PLACEHOLDER_COLOR)
  })

  it('uses the fabric colour of a demo piece', () => {
    const demo = DEMO_GARMENTS[0]
    if (demo.source.kind !== 'demo') throw new Error('expected a demo garment')
    expect(placeholderColor(demo)).toBe(fabricBaseColor(demo.source.fabric))
  })
})
