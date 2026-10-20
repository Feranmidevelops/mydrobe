import { MirroredRepeatWrapping, RepeatWrapping } from 'three'
import { describe, expect, it } from 'vitest'
import { tileRepeat } from './photo-textures'

describe('tileRepeat', () => {
  // A 454 x 905 px crop on a 0.42 x 0.65 m front panel.
  const crop = { width: 454, height: 905 }
  const panel = { width: 0.42, height: 0.65 }

  it('repeats a whole repeat of a pattern at the scale the front shows it, across and down', () => {
    const { wrap, repeat } = tileRepeat({ width: 116.3, height: 121.1, wrap: 'repeat' }, crop, panel)
    expect(wrap).toBe(RepeatWrapping)
    // Turned over left to right, as the back and sleeves run the other way round to the front.
    expect(repeat[0]).toBeCloseTo(-454 / (116.3 * 0.42), 6)
    expect(repeat[1]).toBeCloseTo(905 / (121.1 * 0.65), 6)
  })

  it('mirrors a plain sample at the scale of the crop width, as before', () => {
    const { wrap, repeat } = tileRepeat({ width: 91, height: 91, wrap: 'mirror' }, crop, panel)
    expect(wrap).toBe(MirroredRepeatWrapping)
    expect(repeat[0]).toBeCloseTo(1 / ((91 / 454) * 0.42), 6)
    expect(repeat[1]).toBeCloseTo(repeat[0], 9)
  })
})
