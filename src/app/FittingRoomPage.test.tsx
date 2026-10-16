import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWardrobeStore } from '../store/wardrobe.store'
import FittingRoomPage from './FittingRoomPage'

const initialState = useWardrobeStore.getState()

describe('FittingRoomPage', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('opens the upload dialog from the wardrobe and closes it again', async () => {
    const user = userEvent.setup()
    render(<FittingRoomPage />)

    await user.click(screen.getByRole('button', { name: /add clothes/i }))
    expect(screen.getByRole('dialog', { name: 'Add clothes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
