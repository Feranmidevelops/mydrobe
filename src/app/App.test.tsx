import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('names the browser tab after the page', () => {
    window.history.replaceState(null, '', '/fitting-room')
    render(<App />)
    expect(document.title).toBe('Fitting room · Mydrobe')
  })
})
