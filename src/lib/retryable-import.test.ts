import { describe, expect, it, vi } from 'vitest'
import { failedModuleUrl, retryableImport } from './retryable-import'

const FILE = 'https://mydrobe.example/assets/FittingRoom-a1B2_c3.js'
const CHROMIUM = new TypeError(`Failed to fetch dynamically imported module: ${FILE}`)
const FIREFOX = new TypeError(`error loading dynamically imported module: ${FILE}`)
const SAFARI = new TypeError('Importing a module script failed.')

type Module = { default: string }
const viewer: Module = { default: 'the 3D viewer' }

describe('failedModuleUrl', () => {
  it('reads the file from Chromium’s and Firefox’s errors', () => {
    expect(failedModuleUrl(CHROMIUM)).toBe(FILE)
    expect(failedModuleUrl(FIREFOX)).toBe(FILE)
  })

  it('gives nothing when the error names no file', () => {
    expect(failedModuleUrl(SAFARI)).toBeNull()
    expect(failedModuleUrl(new Error('Something else broke'))).toBeNull()
    expect(failedModuleUrl('offline')).toBeNull()
  })
})

describe('retryableImport', () => {
  it('asks for a file that failed to download under a fresh address each time', async () => {
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(CHROMIUM)
    const importUrl = vi
      .fn<(url: string) => Promise<Module>>()
      .mockRejectedValueOnce(new TypeError(`Failed to fetch dynamically imported module: ${FILE}?retry=1`))
      .mockResolvedValueOnce(viewer)
    const loadViewer = retryableImport(load, importUrl)

    await expect(loadViewer()).rejects.toBe(CHROMIUM)
    await expect(loadViewer()).rejects.toThrow(TypeError)
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(load).toHaveBeenCalledOnce()
    expect(importUrl.mock.calls).toEqual([[`${FILE}?retry=1`], [`${FILE}?retry=2`]])
  })

  it('imports as written again when the browser doesn’t say which file failed', async () => {
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(SAFARI).mockResolvedValueOnce(viewer)
    const importUrl = vi.fn<(url: string) => Promise<Module>>()
    const loadViewer = retryableImport(load, importUrl)

    await expect(loadViewer()).rejects.toBe(SAFARI)
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(importUrl).not.toHaveBeenCalled()
  })
})
