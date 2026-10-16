import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageLoading } from './PageLoading'

describe('PageLoading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reassures people on slow connections after a few seconds', () => {
    vi.useFakeTimers()
    render(<PageLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Opening the fitting room…')
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByRole('status')).toHaveTextContent('This can take a little longer on a slow connection.')
  })
})
