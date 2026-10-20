import { MirroredRepeatWrapping, RepeatWrapping } from 'three'
import { describe, expect, it } from 'vitest'
import { tileRepeat } from './photo-textures'

describe('tileRepeat', () => {
  it('repeats a whole repeat of a pattern plainly, at the size it had in the photo', () => {
    // A 116 x 121 px repeat on a 455 px crop that covers a 0.42 m panel.
    const { wrap, repeat } = tileRepeat({ width: 116.3, height: 121.1, wrap: 'repeat' }, 455, 0.42)
    expect(wrap).toBe(RepeatWrapping)
    expect(repeat[0]).toBeCloseTo(9.315, 3)
    expect(repeat[1]).toBeCloseTo(8.9458, 3)
  })

  it('mirrors a plain sample, as before', () => {
    const { wrap, repeat } = tileRepeat({ width: 91, height: 91, wrap: 'mirror' }, 455, 0.42)
    expect(wrap).toBe(MirroredRepeatWrapping)
    expect(repeat[0]).toBeCloseTo(1 / ((91 / 455) * 0.42), 6)
    expect(repeat[1]).toBeCloseTo(repeat[0], 9)
  })
})
