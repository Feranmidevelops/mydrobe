import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import { createOutfit } from '../../features/outfits/outfit.operations'
import { listOutfits } from '../../features/outfits/outfit.repository'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { SaveOutfit } from './SaveOutfit'

const initialState = useWardrobeStore.getState()
const look = { shirt: 'demo-oxford-stripe', trousers: 'demo-indigo-denim' }

describe('SaveOutfit', () => {
  beforeEach(async () => {
    useWardrobeStore.setState({ ...initialState, selection: look }, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('names and saves what is on the mannequin', async () => {
    const user = userEvent.setup()
    render(<SaveOutfit garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Save outfit' }))
    const name = screen.getByLabelText('Name this outfit')
    expect(name).toHaveValue('Look 1')
    expect(name).toHaveFocus()

    await user.clear(name)
    await user.type(name, 'Friday drinks')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved as “Friday drinks”')).toBeInTheDocument()
    expect((await listOutfits()).map((outfit) => outfit.name)).toEqual(['Friday drinks'])
  })

  it('asks for a name rather than saving a blank one', async () => {
    const user = userEvent.setup()
    render(<SaveOutfit garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Save outfit' }))
    await user.clear(screen.getByLabelText('Name this outfit'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the outfit a name.')
    expect(screen.getByLabelText('Name this outfit')).toHaveAttribute('aria-invalid', 'true')
    expect(await listOutfits()).toEqual([])
  })

  it('backs out with Escape', async () => {
    const user = userEvent.setup()
    render(<SaveOutfit garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Save outfit' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: 'Save outfit' })).toBeInTheDocument()
  })

  it('says when this exact look is already saved', () => {
    useWardrobeStore.setState({ outfits: [createOutfit('Office', look, 'medium')] })
    render(<SaveOutfit garments={DEMO_GARMENTS} />)

    expect(screen.getByText('Saved as “Office”')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save outfit' })).not.toBeInTheDocument()
  })
})
