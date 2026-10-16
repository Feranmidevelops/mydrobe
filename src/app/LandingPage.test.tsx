import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWardrobeStore } from '../store/wardrobe.store'
import LandingPage from './LandingPage'

const initialState = useWardrobeStore.getState()

describe('LandingPage', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('points every main call to action at the fitting room', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: 'Enter the fitting room' })).toHaveAttribute('href', '/fitting-room')
    for (const link of screen.getAllByRole('link', { name: 'Fitting room' })) {
      expect(link).toHaveAttribute('href', '/fitting-room')
    }
  })

  it('shows the three featured looks', () => {
    render(<LandingPage />)
    expect(screen.getAllByRole('link', { name: /^Try the look/ })).toHaveLength(3)
    expect(screen.getByText('Styled with stone chinos')).toBeInTheDocument()
  })

  it('opens a featured look as a complete outfit', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('link', { name: 'Try the look: Oxford stripe shirt with stone chinos' }))

    expect(useWardrobeStore.getState().selection).toEqual({
      shirt: 'demo-oxford-stripe',
      trousers: 'demo-stone-chinos',
    })
    expect(window.location.pathname).toBe('/fitting-room')
  })

  it('opens the fitting room on the body shape that was picked', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('link', { name: /^Large/ }))

    expect(useWardrobeStore.getState().bodyPreset).toBe('large')
    expect(window.location.pathname).toBe('/fitting-room')
  })
})
