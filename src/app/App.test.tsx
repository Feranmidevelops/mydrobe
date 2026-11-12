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

  it('shows the privacy page at /privacy, saying who runs Mydrobe and how to reach them', () => {
    window.history.replaceState(null, '', '/privacy')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'workwithferanmi@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:workwithferanmi@gmail.com',
    )
    expect(document.title).toBe('Privacy · Mydrobe')
  })

  it('links to the privacy page from the footer', () => {
    render(<App />)
    expect(screen.getByRole('contentinfo').querySelector('a[href="/privacy"]')).toHaveTextContent('Privacy')
  })

  it('loads the fitting room at /fitting-room', async () => {
    window.history.replaceState(null, '', '/fitting-room')
    render(<App />)
    // The fitting room is loaded on demand, which can be slow on a busy machine.
    expect(await screen.findByRole('region', { name: 'Fitting room' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(document.title).toBe('Fitting room · Mydrobe')
  })
})
