import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import type { Garment } from '../../features/garments/garment.types'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { WardrobePanel } from './WardrobePanel'

const initialState = useWardrobeStore.getState()

const navyShirt: Garment = {
  id: 'upload-navy-shirt',
  name: 'Navy shirt',
  category: 'shirt',
  templateId: 'shirt-long-sleeve',
  source: { kind: 'photo', url: 'blob:navy-shirt' },
  tags: ['upload'],
  createdAt: 0,
  updatedAt: 0,
}

function shelf(name: 'Your clothes' | 'Demo pieces') {
  return within(screen.getByRole('list', { name }))
}

function card(name: RegExp, from: 'Your clothes' | 'Demo pieces' = 'Demo pieces') {
  return shelf(from).getByRole('button', { name })
}

describe('WardrobePanel', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prompts for a selection when nothing is worn', () => {
    render(<WardrobePanel garments={DEMO_GARMENTS} />)
    expect(screen.getByText(/pick a shirt and trousers/i)).toBeInTheDocument()
    expect(screen.getByText('8 items')).toBeInTheDocument()
  })

  it('selects a shirt and trousers and lists them in the outfit', async () => {
    const user = userEvent.setup()
    render(<WardrobePanel garments={DEMO_GARMENTS} />)

    await user.click(card(/oxford stripe shirt/i))
    await user.click(card(/indigo denim/i))

    expect(card(/oxford stripe shirt/i)).toHaveAttribute('aria-pressed', 'true')
    expect(card(/indigo denim/i)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Take off Oxford stripe shirt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take off Indigo denim' })).toBeInTheDocument()
  })

  it('swaps shirts instead of stacking them', async () => {
    const user = userEvent.setup()
    render(<WardrobePanel garments={DEMO_GARMENTS} />)

    await user.click(card(/oxford stripe shirt/i))
    await user.click(card(/navy gingham shirt/i))

    expect(card(/oxford stripe shirt/i)).toHaveAttribute('aria-pressed', 'false')
    expect(card(/navy gingham shirt/i)).toHaveAttribute('aria-pressed', 'true')
  })

  it('explains why a 2D-only garment is not on the mannequin', async () => {
    const user = userEvent.setup()
    render(<WardrobePanel garments={DEMO_GARMENTS} />)

    await user.click(card(/camel wool overcoat/i))

    expect(screen.getByRole('note')).toHaveTextContent(
      "Not shown on the mannequin. There's no 3D template for outerwear yet.",
    )
  })

  it('filters the wardrobe by category', async () => {
    const user = userEvent.setup()
    render(<WardrobePanel garments={DEMO_GARMENTS} />)

    await user.click(screen.getByRole('button', { name: 'Trousers' }))

    expect(shelf('Demo pieces').getAllByRole('listitem')).toHaveLength(3)
  })

  it('keeps your own clothes apart from the demo pieces', () => {
    render(<WardrobePanel garments={[navyShirt, ...DEMO_GARMENTS]} />)

    expect(shelf('Your clothes').getAllByRole('listitem')).toHaveLength(1)
    expect(card(/^navy shirt/i, 'Your clothes')).toBeInTheDocument()
    expect(shelf('Demo pieces').getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText('9 items')).toBeInTheDocument()
  })

  it('offers a way to add clothes, with a tip before the first upload', async () => {
    const user = userEvent.setup()
    const onAddClothes = vi.fn()
    render(<WardrobePanel garments={DEMO_GARMENTS} onAddClothes={onAddClothes} />)

    expect(screen.getByText(/laid flat on a plain background/i)).toBeInTheDocument()
    await user.click(card(/add clothes/i, 'Your clothes'))
    expect(onAddClothes).toHaveBeenCalledOnce()
  })

  it('filters your own clothes along with the demo pieces', async () => {
    const user = userEvent.setup()
    render(<WardrobePanel garments={[navyShirt, ...DEMO_GARMENTS]} onAddClothes={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Trousers' }))

    expect(shelf('Your clothes').queryByRole('button', { name: /^navy shirt/i })).not.toBeInTheDocument()
    expect(card(/add clothes/i, 'Your clothes')).toBeInTheDocument()
  })

  it('removes one of your own clothes after checking, taking it off the mannequin', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    useWardrobeStore.getState().addUpload(navyShirt)
    useWardrobeStore.getState().wear([navyShirt])
    render(<WardrobePanel garments={[navyShirt, ...DEMO_GARMENTS]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Navy shirt from your wardrobe' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove Navy shirt from your wardrobe?'))
    expect(useWardrobeStore.getState().uploads).toEqual([])
    expect(useWardrobeStore.getState().selection).toEqual({})
  })

  it('keeps the piece when removing is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    useWardrobeStore.getState().addUpload(navyShirt)
    render(<WardrobePanel garments={[navyShirt, ...DEMO_GARMENTS]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Navy shirt from your wardrobe' }))

    expect(useWardrobeStore.getState().uploads).toEqual([navyShirt])
  })

  it('never offers to remove a demo piece', () => {
    render(<WardrobePanel garments={DEMO_GARMENTS} />)
    expect(shelf('Demo pieces').queryAllByRole('button', { name: /remove/i })).toHaveLength(0)
  })

  it('goes back to everything when the filtered category runs out', async () => {
    const user = userEvent.setup()
    const navyShorts: Garment = { ...navyShirt, id: 'upload-navy-shorts', name: 'Navy shorts', category: 'other' }
    const { rerender } = render(<WardrobePanel garments={[navyShorts, ...DEMO_GARMENTS]} />)

    await user.click(screen.getByRole('button', { name: 'Other' }))
    rerender(<WardrobePanel garments={DEMO_GARMENTS} />)

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(shelf('Demo pieces').getAllByRole('listitem')).toHaveLength(8)
  })

  it('shows an empty state without garments', () => {
    render(<WardrobePanel garments={[]} />)
    expect(screen.getByText('Your wardrobe is empty.')).toBeInTheDocument()
  })

  it('still offers to add clothes when the wardrobe is empty', () => {
    render(<WardrobePanel garments={[]} onAddClothes={() => {}} />)
    expect(screen.queryByText('Your wardrobe is empty.')).not.toBeInTheDocument()
    expect(card(/add clothes/i, 'Your clothes')).toBeInTheDocument()
  })
})
