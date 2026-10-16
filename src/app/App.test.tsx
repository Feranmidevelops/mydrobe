import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('opens on the landing page', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'See it on before you wear it' })).toBeInTheDocument()
    expect(document.title).toBe('Mydrobe · Virtual wardrobe')
  })

  it('loads the fitting room at /fitting-room', async () => {
    window.history.replaceState(null, '', '/fitting-room')
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Fitting room' })).toBeInTheDocument()
    expect(document.title).toBe('Fitting room · Mydrobe')
  })
})
