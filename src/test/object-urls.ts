import { vi } from 'vitest'

/** The blob behind each fake object URL handed out in tests. */
export const objectUrlBlobs = new Map<string, Blob>()
let issued = 0

/**
 * jsdom has no object URLs. These stand-ins hand out unique fake ones and
 * remember their blobs, so tests can check what a URL points at.
 */
export function installObjectUrls() {
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test/${++issued}`
    objectUrlBlobs.set(url, blob)
    return url
  }) as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn((url: string) => {
    objectUrlBlobs.delete(url)
  })
}
