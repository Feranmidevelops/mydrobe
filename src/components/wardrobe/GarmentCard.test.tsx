import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import { GarmentCard } from './GarmentCard'

const shirt = DEMO_GARMENTS[0]

describe('GarmentCard', () => {
  it('has no remove button unless the garment can be removed', () => {
    render(<GarmentCard garment={shirt} selected={false} onToggle={() => {}} />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('removes without also putting the garment on or taking it off', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const onRemove = vi.fn()
    render(<GarmentCard garment={shirt} selected onToggle={onToggle} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: `Remove ${shirt.name} from your wardrobe` }))
    expect(onRemove).toHaveBeenCalledWith(shirt)
    expect(onToggle).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { pressed: true }))
    expect(onToggle).toHaveBeenCalledWith(shirt)
  })
})
