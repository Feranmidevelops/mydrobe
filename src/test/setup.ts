import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom has no canvas or WebGL implementation and logs a "not implemented"
// error for every getContext call. Returning null mirrors a browser without
// support, which is exactly the path the UI must handle anyway.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)

// jsdom doesn't implement scrolling; page changes scroll to the top.
window.scrollTo = vi.fn() as typeof window.scrollTo
