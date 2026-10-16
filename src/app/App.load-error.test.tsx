import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// The fitting room's code fails to download, as on a dropped connection.
vi.mock('./pages', () => ({
  loadFittingRoomPage: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
}))

describe('App when the fitting room fails to load', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('explains what happened and offers a way back instead of a blank page', async () => {
    const user = userEvent.setup()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.history.replaceState(null, '', '/fitting-room')
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent("The fitting room couldn't open")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to the home page' }))
    expect(screen.getByRole('heading', { level: 1, name: 'See it on before you wear it' })).toBeInTheDocument()
    quiet.mockRestore()
  })
})
