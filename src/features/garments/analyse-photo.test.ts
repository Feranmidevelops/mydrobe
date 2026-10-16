import { describe, expect, it } from 'vitest'
import { analysePhoto } from './analyse-photo'
import { PhotoMappingError } from './photo-analysis'

function photo(withGarment: boolean) {
  const width = 60
  const data = new Uint8ClampedArray(width * width * 4).fill(255)
  if (withGarment) {
    for (let y = 10; y < 50; y++) {
      for (let x = 15; x < 45; x++) data.set([40, 60, 120, 255], (y * width + x) * 4)
    }
  }
  return { data, width, height: width }
}

describe('analysePhoto', () => {
  // jsdom has no workers, so this exercises the main-thread fallback.
  it('analyses on the main thread where workers are unavailable', async () => {
    const analysis = await analysePhoto(photo(true), 'trousers-straight')
    expect(analysis.crop).toEqual({ x: 15, y: 10, width: 30, height: 40 })
  })

  it('rejects with a mapping error when there is no garment', async () => {
    await expect(analysePhoto(photo(false), 'trousers-straight')).rejects.toBeInstanceOf(PhotoMappingError)
  })
})
