import { beforeEach, describe, expect, it } from 'vitest'
import { useWardrobeStore } from './wardrobe.store'

const initialState = useWardrobeStore.getState()

describe('wardrobe store', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('starts on the medium preset with nothing worn', () => {
    expect(useWardrobeStore.getState()).toMatchObject({ bodyPreset: 'medium', selection: {} })
  })

  it('keeps the outfit intact while switching Small → Medium → Large', () => {
    const { toggleGarment, setBodyPreset } = useWardrobeStore.getState()
    toggleGarment({ id: 'demo-oxford-stripe', category: 'shirt' })
    toggleGarment({ id: 'demo-indigo-denim', category: 'trousers' })

    for (const preset of ['small', 'medium', 'large'] as const) {
      setBodyPreset(preset)
      expect(useWardrobeStore.getState()).toMatchObject({
        bodyPreset: preset,
        selection: { shirt: 'demo-oxford-stripe', trousers: 'demo-indigo-denim' },
      })
    }
  })

  it('takes off one category or clears the whole outfit', () => {
    const { toggleGarment, takeOff, clearOutfit } = useWardrobeStore.getState()
    toggleGarment({ id: 'demo-oxford-stripe', category: 'shirt' })
    toggleGarment({ id: 'demo-indigo-denim', category: 'trousers' })

    takeOff('shirt')
    expect(useWardrobeStore.getState().selection).toEqual({ trousers: 'demo-indigo-denim' })

    clearOutfit()
    expect(useWardrobeStore.getState().selection).toEqual({})
  })
})
