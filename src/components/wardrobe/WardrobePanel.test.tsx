import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { WardrobePanel } from './WardrobePanel'

const initialState = useWardrobeStore.getState()

function card(name: RegExp) {
  return within(screen.getByRole('list', { name: 'Wardrobe items' })).getByRole('button', { name })
}

describe('WardrobePanel', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
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

    const items = within(screen.getByRole('list', { name: 'Wardrobe items' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
  })

  it('shows an empty state without garments', () => {
    render(<WardrobePanel garments={[]} />)
    expect(screen.getByText('Your wardrobe is empty.')).toBeInTheDocument()
  })
})
