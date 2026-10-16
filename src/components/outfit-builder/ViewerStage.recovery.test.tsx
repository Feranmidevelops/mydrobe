import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewerStage } from './ViewerStage'

const viewer = vi.hoisted(() => ({ crash: false }))

// jsdom has no WebGL, so a stand-in plays the 3D view: it can crash, or lose its context.
vi.mock('../../features/mannequin/webgl', () => ({ supportsWebGL: () => true }))
vi.mock('../../features/mannequin/FittingRoom', () => ({
  default: function FittingRoomStandIn({ onContextLost }: { onContextLost?: () => void }) {
    if (viewer.crash) throw new Error('The GPU gave up')
    return (
      <button type="button" onClick={onContextLost}>
        Lose the 3D context
      </button>
    )
  },
}))

describe('ViewerStage', () => {
  afterEach(() => {
    viewer.crash = false
  })

  it('offers to restart when the browser takes the 3D context away', async () => {
    const user = userEvent.setup()
    render(<ViewerStage />)

    await user.click(await screen.findByRole('button', { name: 'Lose the 3D context' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The 3D view was interrupted')

    await user.click(screen.getByRole('button', { name: 'Restart the 3D view' }))
    expect(await screen.findByRole('button', { name: 'Lose the 3D context' })).toBeInTheDocument()
  })

  it('lets you try again after the viewer crashes', async () => {
    const user = userEvent.setup()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    viewer.crash = true
    render(<ViewerStage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('The 3D viewer stopped')
    viewer.crash = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Lose the 3D context' })).toBeInTheDocument()
    quiet.mockRestore()
  })
})
