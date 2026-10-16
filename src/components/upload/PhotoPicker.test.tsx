import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoPicker } from './PhotoPicker'

const photo = () => new File(['photo'], 'shirt.jpg', { type: 'image/jpeg' })

describe('PhotoPicker', () => {
  it('explains the four things that make a photo work', () => {
    render(<PhotoPicker onPhoto={() => {}} busy={false} />)
    const rules = within(screen.getByRole('region', { name: 'For the best fit on the mannequin' }))
    expect(rules.getAllByRole('listitem')).toHaveLength(4)
    expect(rules.getByText('A plain background')).toBeInTheDocument()
  })

  it('passes on a chosen photo', async () => {
    const user = userEvent.setup()
    const onPhoto = vi.fn()
    render(<PhotoPicker onPhoto={onPhoto} busy={false} />)

    const file = photo()
    await user.upload(screen.getByLabelText('Choose a photo'), file)

    expect(onPhoto).toHaveBeenCalledWith(file)
  })

  it('passes on a dropped photo', () => {
    const onPhoto = vi.fn()
    render(<PhotoPicker onPhoto={onPhoto} busy={false} />)

    const file = photo()
    fireEvent.drop(screen.getByRole('group', { name: 'Add a photo' }), { dataTransfer: { files: [file] } })

    expect(onPhoto).toHaveBeenCalledWith(file)
  })

  it('shows progress while checking, then any problem with the photo', () => {
    const { rerender } = render(<PhotoPicker onPhoto={() => {}} busy />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking your photo…')
    expect(screen.queryByLabelText('Choose a photo')).not.toBeInTheDocument()

    rerender(<PhotoPicker onPhoto={() => {}} busy={false} error="That photo is over 15 MB." />)
    expect(screen.getByRole('alert')).toHaveTextContent('That photo is over 15 MB.')
  })
})
