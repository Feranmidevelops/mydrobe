import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import { createOutfit } from '../../features/outfits/outfit.operations'
import { listOutfits, putOutfit } from '../../features/outfits/outfit.repository'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { SavedOutfits } from './SavedOutfits'

const initialState = useWardrobeStore.getState()
const office = createOutfit('Office', { shirt: 'demo-oxford-stripe', trousers: 'demo-indigo-denim' }, 'large', 1000)

async function saveOffice() {
  await putOutfit(office)
  useWardrobeStore.setState({ outfits: [office] })
}

describe('SavedOutfits', () => {
  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('explains how to save one before there are any', () => {
    render(<SavedOutfits garments={DEMO_GARMENTS} />)
    expect(screen.getByText('No saved outfits yet')).toBeInTheDocument()
  })

  it('says so while saved outfits are loading', () => {
    useWardrobeStore.setState({ storage: 'loading' })
    render(<SavedOutfits garments={DEMO_GARMENTS} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading your saved outfits…')
  })

  it('puts a saved outfit back on, on the body shape it was saved with', async () => {
    const user = userEvent.setup()
    await saveOffice()
    render(<SavedOutfits garments={DEMO_GARMENTS} />)

    const card = within(screen.getByRole('article', { name: 'Office' }))
    expect(card.getByText('Oxford stripe shirt · Indigo denim · Large')).toBeInTheDocument()
    await user.click(card.getByRole('button', { name: 'Wear' }))

    expect(useWardrobeStore.getState()).toMatchObject({ selection: office.garmentIds, bodyPreset: 'large' })
    expect(card.getByRole('button', { name: 'Wearing' })).toBeDisabled()
  })

  it('renames an outfit in place', async () => {
    const user = userEvent.setup()
    await saveOffice()
    render(<SavedOutfits garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Rename Office' }))
    const name = screen.getByLabelText('New name for Office')
    await user.clear(name)
    await user.type(name, 'Work week{Enter}')

    expect(await screen.findByRole('article', { name: 'Work week' })).toBeInTheDocument()
    expect((await listOutfits()).map((outfit) => outfit.name)).toEqual(['Work week'])
  })

  it('keeps the old name if the new one is blank', async () => {
    const user = userEvent.setup()
    await saveOffice()
    render(<SavedOutfits garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Rename Office' }))
    await user.clear(screen.getByLabelText('New name for Office'))
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the outfit a name.')
    expect((await listOutfits()).map((outfit) => outfit.name)).toEqual(['Office'])
  })

  it('deletes an outfit after checking, leaving its clothes alone', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await saveOffice()
    render(<SavedOutfits garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Delete Office' }))

    expect(confirm).toHaveBeenCalledWith('Delete “Office”? Its clothes stay in your wardrobe.')
    expect(await screen.findByText('No saved outfits yet')).toBeInTheDocument()
    expect(await listOutfits()).toEqual([])
    confirm.mockRestore()
  })

  it('shows which pieces have left the wardrobe', () => {
    useWardrobeStore.setState({
      outfits: [{ ...office, garmentIds: { trousers: 'demo-indigo-denim' }, missingSlots: ['shirt'] }],
    })
    render(<SavedOutfits garments={DEMO_GARMENTS} />)

    expect(screen.getByText('Shirt removed from your wardrobe')).toBeInTheDocument()
    expect(screen.getByText('Indigo denim · Large')).toBeInTheDocument()
  })
})
