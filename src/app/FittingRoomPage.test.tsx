import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveGarment } from '../features/garments/garment.repository'
import { db } from '../lib/db'
import { useWardrobeStore } from '../store/wardrobe.store'
import FittingRoomPage from './FittingRoomPage'

const initialState = useWardrobeStore.getState()

async function renderPage() {
  render(<FittingRoomPage />)
  await waitFor(() => expect(useWardrobeStore.getState().storage).toBe('ready'))
}

describe('FittingRoomPage', () => {
  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('opens the upload dialog from the wardrobe and closes it again', async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole('button', { name: /add clothes/i }))
    expect(screen.getByRole('dialog', { name: 'Add clothes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('brings back the clothes saved on this device', async () => {
    await saveGarment(
      {
        id: 'upload-navy-shirt',
        name: 'Navy shirt',
        category: 'shirt',
        templateId: 'shirt-long-sleeve',
        source: { kind: 'photo', url: 'blob:navy-shirt' },
        tags: ['upload'],
        createdAt: 1000,
        updatedAt: 1000,
      },
      { photo: new Blob(['photo'], { type: 'image/webp' }), mimeType: 'image/jpeg', fileSize: 1000 },
    )

    await renderPage()

    const yourClothes = within(screen.getByRole('list', { name: 'Your clothes' }))
    expect(await yourClothes.findByRole('button', { name: /^navy shirt/i })).toBeInTheDocument()
  })
})
