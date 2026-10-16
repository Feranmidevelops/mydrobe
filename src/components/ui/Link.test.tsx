import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../app/router'
import { Link } from './Link'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('Link', () => {
  it('switches pages in place on a plain click', async () => {
    const user = userEvent.setup()
    render(<Link to={ROUTES.fittingRoom}>Open</Link>)

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/fitting-room')
    await user.click(screen.getByRole('link', { name: 'Open' }))
    expect(window.location.pathname).toBe('/fitting-room')
  })

  it('leaves modified clicks to the browser', async () => {
    const user = userEvent.setup()
    render(<Link to={ROUTES.fittingRoom}>Open</Link>)

    await user.keyboard('{Control>}')
    await user.click(screen.getByRole('link', { name: 'Open' }))
    await user.keyboard('{/Control}')
    expect(window.location.pathname).toBe('/')
  })
})
