import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewerLoading } from './ViewerLoading'

describe('ViewerLoading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reassures people on slow connections after a few seconds', () => {
    vi.useFakeTimers()
    render(<ViewerLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Setting up the fitting room…')
    expect(screen.queryByText(/slow connection/)).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByText('This can take a little longer on a slow connection.')).toBeInTheDocument()
  })
})
