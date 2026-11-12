import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { supportsWebGL } from './webgl'

// src/test/setup.ts already spies on getContext, because jsdom has no WebGL.
// These tests decide which contexts a canvas offers.
const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as MockInstance<
  (kind: string) => object | null
>

/** Makes every canvas offer only the given kinds of context. Returns the probe's release spy. */
function offer(kinds: string[]) {
  const loseContext = vi.fn()
  getContext.mockImplementation((kind) =>
    kinds.includes(kind)
      ? { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null) }
      : null,
  )
  return loseContext
}

afterEach(() => {
  getContext.mockImplementation(() => null)
})

describe('supportsWebGL', () => {
  it('needs WebGL 2, because the 3D viewer can’t run on WebGL 1 alone', () => {
    const loseContext = offer(['webgl2', 'webgl'])
    expect(supportsWebGL()).toBe(true)
    // The probe context is released, so it doesn't count against the browser's limit.
    expect(loseContext).toHaveBeenCalledOnce()

    offer(['webgl'])
    expect(supportsWebGL()).toBe(false)
  })
})
