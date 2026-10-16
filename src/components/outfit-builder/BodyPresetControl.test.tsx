import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { BodyPresetControl } from './BodyPresetControl'

const initialState = useWardrobeStore.getState()

describe('BodyPresetControl', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('switches presets by click', async () => {
    const user = userEvent.setup()
    render(<BodyPresetControl />)

    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Large' }))

    expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true')
    expect(useWardrobeStore.getState().bodyPreset).toBe('large')
  })

  it('supports arrow keys and wraps around', async () => {
    const user = userEvent.setup()
    render(<BodyPresetControl />)

    await user.tab()
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Small' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Large' })).toHaveFocus()
    expect(useWardrobeStore.getState().bodyPreset).toBe('large')
  })
})
