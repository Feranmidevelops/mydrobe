import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { matchRoute, navigate, ROUTES, useRoute } from './router'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('matchRoute', () => {
  it('recognises the fitting room with or without a trailing slash', () => {
    expect(matchRoute('/fitting-room')).toBe(ROUTES.fittingRoom)
    expect(matchRoute('/fitting-room/')).toBe(ROUTES.fittingRoom)
  })

  it('sends the root and unknown paths home', () => {
    expect(matchRoute('/')).toBe(ROUTES.home)
    expect(matchRoute('')).toBe(ROUTES.home)
    expect(matchRoute('/somewhere-else')).toBe(ROUTES.home)
  })
})

describe('useRoute', () => {
  it('follows navigate() and the back button', () => {
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe(ROUTES.home)

    act(() => navigate(ROUTES.fittingRoom))
    expect(result.current).toBe(ROUTES.fittingRoom)
    expect(window.location.pathname).toBe('/fitting-room')

    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current).toBe(ROUTES.home)
  })
})
