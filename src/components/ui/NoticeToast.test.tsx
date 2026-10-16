import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { NoticeToast } from './NoticeToast'

const initialState = useWardrobeStore.getState()

describe('NoticeToast', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('confirms what just happened, then goes after a few seconds', () => {
    vi.useFakeTimers()
    render(<NoticeToast />)

    act(() => useWardrobeStore.getState().showNotice('success', 'Navy shirt added to your wardrobe'))
    expect(screen.getByRole('status')).toHaveTextContent('Navy shirt added to your wardrobe')

    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('raises problems as alerts that can be dismissed', async () => {
    const user = userEvent.setup()
    render(<NoticeToast />)

    act(() => useWardrobeStore.getState().showNotice('error', "Couldn't remove Navy shirt from this device."))
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't remove Navy shirt from this device.")
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })
})
