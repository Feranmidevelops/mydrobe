import { afterEach, describe, expect, it, vi } from 'vitest'
import { failedModuleUrl, preloadedFile, retryableImport } from './retryable-import'

const FILE = 'https://mydrobe.example/assets/FittingRoom-a1B2_c3.js'
const NAME = /\/FittingRoom-[\w-]+\.js$/
const CHROMIUM = new TypeError(`Failed to fetch dynamically imported module: ${FILE}`)
const FIREFOX = new TypeError(`error loading dynamically imported module: ${FILE}`)
const SAFARI = new TypeError('Importing a module script failed.')

type Module = { default: string }
const viewer: Module = { default: 'the 3D viewer' }

/** Adds a preload link to the page, as Vite does for a file just before importing it. */
function preload(href: string, rel = 'modulepreload') {
  const link = document.createElement('link')
  link.rel = rel
  link.setAttribute('as', 'script')
  link.href = href
  document.head.append(link)
}

/** The retry addresses asked for: the file with a fresh ?retry= each time. */
function retriesOf(importUrl: { mock: { calls: string[][] } }) {
  return importUrl.mock.calls.map(([url]) => {
    const asked = new URL(url)
    const retry = asked.searchParams.get('retry')
    asked.search = ''
    return { file: asked.href, retry }
  })
}

afterEach(() => {
  document.head.querySelectorAll('link').forEach((link) => link.remove())
})

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

describe('preloadedFile', () => {
  it('finds a preloaded file by its name', () => {
    preload('https://mydrobe.example/assets/index-XyZ.js')
    preload(FILE)
    expect(preloadedFile(NAME)).toBe(FILE)
  })

  it('also finds one preloaded where modulepreload isn’t supported, and nothing when none matches', () => {
    preload(FILE, 'preload')
    expect(preloadedFile(NAME)).toBe(FILE)
    expect(preloadedFile(/\/Other-[\w-]+\.js$/)).toBeNull()
  })
})

describe('retryableImport', () => {
  it('asks for a file that failed to download under a fresh address each time', async () => {
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(CHROMIUM)
    const importUrl = vi
      .fn<(url: string) => Promise<Module>>()
      .mockRejectedValueOnce(new TypeError(`Failed to fetch dynamically imported module: ${FILE}?retry=x`))
      .mockResolvedValueOnce(viewer)
    const loadViewer = retryableImport(load, { importUrl })

    await expect(loadViewer()).rejects.toBe(CHROMIUM)
    await expect(loadViewer()).rejects.toThrow(TypeError)
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(load).toHaveBeenCalledOnce()
    const [first, second] = retriesOf(importUrl)
    expect([first.file, second.file]).toEqual([FILE, FILE])
    expect(first.retry).toBeTruthy()
    expect(second.retry).not.toBe(first.retry)
  })

  it('never asks under the same fresh address twice, even from a new page after a reload', async () => {
    const asked = new Set<string>()
    for (let page = 0; page < 3; page++) {
      const importUrl = vi.fn<(url: string) => Promise<Module>>().mockRejectedValue(CHROMIUM)
      const loadViewer = retryableImport(() => Promise.reject(CHROMIUM), { importUrl })
      for (let tries = 0; tries < 3; tries++) await loadViewer().catch(() => {})
      for (const [url] of importUrl.mock.calls) asked.add(url)
    }
    expect(asked.size).toBe(6)
  })

  it('finds the file Safari doesn’t name among Vite’s preload links, and asks again at once under a fresh address', async () => {
    preload(FILE)
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(SAFARI)
    const importUrl = vi.fn<(url: string) => Promise<Module>>().mockResolvedValueOnce(viewer)
    const loadViewer = retryableImport(load, { file: NAME, importUrl })

    // After a reload, WebKit fails the first try without asking the network, so the fresh address can't wait for Try again.
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(retriesOf(importUrl).map(({ file }) => file)).toEqual([FILE])
  })

  it('in Safari, keeps asking under fresh addresses while the download still fails', async () => {
    preload(FILE)
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(SAFARI)
    const importUrl = vi
      .fn<(url: string) => Promise<Module>>()
      .mockRejectedValueOnce(SAFARI)
      .mockRejectedValueOnce(SAFARI)
      .mockResolvedValueOnce(viewer)
    const loadViewer = retryableImport(load, { file: NAME, importUrl })

    await expect(loadViewer()).rejects.toBe(SAFARI)
    await expect(loadViewer()).rejects.toBe(SAFARI)
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(load).toHaveBeenCalledOnce()
    expect(new Set(retriesOf(importUrl).map(({ retry }) => retry)).size).toBe(3)
  })

  it('imports as written again when the file can’t be found', async () => {
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(SAFARI).mockResolvedValueOnce(viewer)
    const importUrl = vi.fn<(url: string) => Promise<Module>>()
    const loadViewer = retryableImport(load, { file: NAME, importUrl })

    await expect(loadViewer()).rejects.toBe(SAFARI)
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(importUrl).not.toHaveBeenCalled()
  })

  it('doesn’t retry a file that downloaded but then failed to run', async () => {
    preload(FILE)
    const broken = new ReferenceError('three is not defined')
    const load = vi.fn<() => Promise<Module>>().mockRejectedValueOnce(broken).mockResolvedValueOnce(viewer)
    const importUrl = vi.fn<(url: string) => Promise<Module>>()
    const loadViewer = retryableImport(load, { file: NAME, importUrl })

    await expect(loadViewer()).rejects.toBe(broken)
    await expect(loadViewer()).resolves.toBe(viewer)
    expect(importUrl).not.toHaveBeenCalled()
  })
})
