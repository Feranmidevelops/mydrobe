import { describe, expect, it, vi } from 'vitest'
import { keepSavedData } from './keep-saved-data'

function fakeStorage({ persisted = false, granted = true } = {}) {
  return { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => granted) }
}

describe('keepSavedData', () => {
  it('asks the browser to keep saved data, once a visit', async () => {
    const storage = fakeStorage()

    expect(await keepSavedData(storage)).toBe(true)
    expect(await keepSavedData(storage)).toBe(false)
    expect(storage.persist).toHaveBeenCalledTimes(1)
  })

  it("doesn't ask again when the browser already keeps it", async () => {
    const storage = fakeStorage({ persisted: true })

    expect(await keepSavedData(storage)).toBe(true)
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('carries on when the browser says no, fails, or has no such thing', async () => {
    expect(await keepSavedData(fakeStorage({ granted: false }))).toBe(false)
    expect(await keepSavedData({ persist: () => Promise.reject(new Error('blocked')) })).toBe(false)
    expect(await keepSavedData({})).toBe(false)
    expect(await keepSavedData(undefined)).toBe(false)
  })
})
