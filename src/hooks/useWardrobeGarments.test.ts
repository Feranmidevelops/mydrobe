import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../features/garments/demo-garments'
import type { Garment } from '../features/garments/garment.types'
import { useWardrobeStore } from '../store/wardrobe.store'
import { useWardrobeGarments } from './useWardrobeGarments'

const initialState = useWardrobeStore.getState()

const navyShirt: Garment = {
  id: 'upload-navy-shirt',
  name: 'Navy shirt',
  category: 'shirt',
  templateId: 'shirt-long-sleeve',
  source: { kind: 'photo', url: 'blob:navy-shirt' },
  tags: ['upload'],
  createdAt: 0,
  updatedAt: 0,
}

describe('useWardrobeGarments', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('shows just the demo pieces before anything is uploaded', () => {
    const { result } = renderHook(() => useWardrobeGarments())
    expect(result.current).toEqual(DEMO_GARMENTS)
  })

  it('lists uploads ahead of the demo pieces', () => {
    const { result } = renderHook(() => useWardrobeGarments())
    act(() => useWardrobeStore.getState().addUpload(navyShirt))

    expect(result.current[0]).toBe(navyShirt)
    expect(result.current).toHaveLength(DEMO_GARMENTS.length + 1)
  })

  it('keeps the same list between renders so the 3D scene does not redo its work', () => {
    const { result, rerender } = renderHook(() => useWardrobeGarments())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
