import '@testing-library/jest-dom/vitest'
// An in-memory IndexedDB, so saving to the device is tested for real.
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { installObjectUrls } from './object-urls'

afterEach(() => {
  cleanup()
})

installObjectUrls()

// jsdom has no canvas or WebGL implementation and logs a "not implemented"
// error for every getContext call. Returning null mirrors a browser without
// support, which is exactly the path the UI must handle anyway.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)

// jsdom doesn't implement scrolling; page changes scroll to the top.
window.scrollTo = vi.fn() as typeof window.scrollTo

// jsdom has no modal dialogs yet. These stand-ins open and close a <dialog>
// the way browsers do, including the close event React listens for.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
