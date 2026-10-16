import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

let shouldThrow = true

function Fragile() {
  if (shouldThrow) throw new Error('Something broke')
  return <p>Working again</p>
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    shouldThrow = true
  })

  it('shows the fallback instead of crashing the page, and can try again', async () => {
    const user = userEvent.setup()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary
        label="Test widget"
        fallback={(retry) => (
          <button type="button" onClick={retry}>
            Try again
          </button>
        )}
      >
        <Fragile />
      </ErrorBoundary>,
    )

    expect(console.error).toHaveBeenCalledWith('Test widget crashed', expect.any(Error), expect.any(String))
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('Working again')).toBeInTheDocument()
    quiet.mockRestore()
  })
})
