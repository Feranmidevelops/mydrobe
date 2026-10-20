import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analysePhotoAt, forgetPhoto } from '../../features/garments/analyse-photo'
import {
  makeThumbnail,
  preparePhoto,
  UploadError,
  type PreparedPhoto,
} from '../../features/garments/garment.service'
import type { PhotoAnalysis } from '../../features/garments/photo-analysis'
import { db } from '../../lib/db'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { UploadDialog } from './UploadDialog'

vi.mock('../../features/garments/analyse-photo', () => ({
  analysePhotoAt: vi.fn(),
  forgetPhoto: vi.fn(),
}))

vi.mock('../../features/garments/garment.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/garments/garment.service')>()),
  preparePhoto: vi.fn(),
  makeThumbnail: vi.fn(),
}))

const initialState = useWardrobeStore.getState()

const prepared: PreparedPhoto = {
  url: 'blob:navy-shirt',
  blob: new Blob(),
  width: 1200,
  height: 1500,
  format: 'jpeg',
  fileName: 'navy-shirt.jpg',
  fileSize: 2_000_000,
}

function navyAnalysis(): PhotoAnalysis {
  const pixels = (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height })
  return {
    image: pixels(100, 100),
    mask: new Uint8Array(100 * 100),
    background: [240, 240, 240],
    bounds: { x: 20, y: 10, width: 60, height: 80 },
    crop: { x: 25, y: 15, width: 50, height: 60 },
    swatch: { x: 40, y: 50, width: 10, height: 10 },
    fabric: [36, 55, 94],
    coverage: 0.95,
    palette: [[36, 55, 94]],
    front: pixels(1, 1),
    swatchPixels: pixels(1, 1),
    tile: { pixels: pixels(1, 1), width: 10, height: 10, wrap: 'mirror' },
  }
}

/** Opens the dialog the way the fitting room does: shown while open, gone once closed. */
function Harness() {
  const [open, setOpen] = useState(true)
  return open ? <UploadDialog onClose={() => setOpen(false)} /> : <p>Dialog closed</p>
}

const photoFile = () => new File(['photo'], 'navy-shirt.jpg', { type: 'image/jpeg' })

async function chooseAndReview(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Choose a photo'), photoFile())
  await screen.findByDisplayValue('Navy shirt')
}

describe('UploadDialog', () => {
  beforeEach(async () => {
    useWardrobeStore.setState(initialState, true)
    await Promise.all(db.tables.map((table) => table.clear()))
    vi.mocked(preparePhoto).mockReset().mockResolvedValue(prepared)
    vi.mocked(analysePhotoAt).mockReset().mockResolvedValue(navyAnalysis())
    vi.mocked(makeThumbnail).mockReset().mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }))
    vi.mocked(forgetPhoto).mockReset()
  })

  it('adds a shirt from a photo, saves it and puts it straight on the mannequin', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Add clothes' })).toHaveTextContent('Step 1 of 2')

    await chooseAndReview(user)
    expect(screen.getByRole('dialog', { name: 'Add clothes' })).toHaveTextContent('Step 2 of 2')
    await user.click(screen.getByRole('button', { name: 'Add to wardrobe' }))

    expect(await screen.findByText('Dialog closed')).toBeInTheDocument()
    const [garment] = useWardrobeStore.getState().uploads
    expect(garment).toMatchObject({
      name: 'Navy shirt',
      category: 'shirt',
      templateId: 'shirt-long-sleeve',
      source: {
        kind: 'photo',
        url: 'blob:navy-shirt',
        thumbnailUrl: expect.stringMatching(/^blob:/),
        backgroundTolerance: 70,
      },
      palette: ['#24375e'],
    })
    expect(useWardrobeStore.getState().selection).toEqual({ shirt: garment.id })
    expect(await db.garments.get(garment.id)).toMatchObject({ name: 'Navy shirt', mimeType: 'image/jpeg' })
    expect(forgetPhoto).not.toHaveBeenCalled()
  })

  it('explains when the piece could not be saved, and lets you try again', async () => {
    const user = userEvent.setup()
    const full = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' })
    const saving = vi.spyOn(db, 'transaction').mockImplementationOnce(() => Promise.reject(full) as never)
    render(<Harness />)
    await chooseAndReview(user)

    await user.click(screen.getByRole('button', { name: 'Add to wardrobe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/enough space/)
    expect(useWardrobeStore.getState().uploads).toEqual([])
    expect(forgetPhoto).not.toHaveBeenCalledWith('blob:navy-shirt')

    await user.click(screen.getByRole('button', { name: 'Add to wardrobe' }))
    expect(await screen.findByText('Dialog closed')).toBeInTheDocument()
    expect(useWardrobeStore.getState().uploads).toHaveLength(1)
    saving.mockRestore()
  })

  it('keeps a piece without a 3D template off the mannequin', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await chooseAndReview(user)

    await user.click(screen.getByRole('radio', { name: 'Outerwear' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to wardrobe' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Add to wardrobe' }))

    await screen.findByText('Dialog closed')
    expect(useWardrobeStore.getState().uploads[0]).toMatchObject({ category: 'outerwear', templateId: null })
    expect(useWardrobeStore.getState().selection).toEqual({})
  })

  it('explains why a photo was turned away and lets you pick another', async () => {
    const user = userEvent.setup()
    vi.mocked(preparePhoto).mockRejectedValue(new UploadError('That photo is over 15 MB. Try a smaller copy.'))
    render(<Harness />)

    await user.upload(screen.getByLabelText('Choose a photo'), photoFile())

    expect(await screen.findByRole('alert')).toHaveTextContent('That photo is over 15 MB.')
    expect(screen.getByLabelText('Choose a photo')).toHaveFocus()
  })

  it('lets go of the photo when you go back to choose another', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await chooseAndReview(user)

    await user.click(screen.getByRole('button', { name: 'Choose another photo' }))

    expect(forgetPhoto).toHaveBeenCalledWith('blob:navy-shirt')
    expect(screen.getByLabelText('Choose a photo')).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Add clothes' })).toHaveTextContent('Step 1 of 2')
  })

  it('lets go of the photo when closed without adding it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await chooseAndReview(user)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(await screen.findByText('Dialog closed')).toBeInTheDocument()
    expect(forgetPhoto).toHaveBeenCalledWith('blob:navy-shirt')
    expect(useWardrobeStore.getState().uploads).toEqual([])
  })

  it('closes even when the browser holds back its close event', async () => {
    const user = userEvent.setup()
    const silentClose = vi
      .spyOn(HTMLDialogElement.prototype, 'close')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.open = false
      })
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(await screen.findByText('Dialog closed')).toBeInTheDocument()
    silentClose.mockRestore()
  })

  it('drops a photo that finishes preparing after the dialog has closed', async () => {
    const user = userEvent.setup()
    let finish: (photo: PreparedPhoto) => void = () => {}
    vi.mocked(preparePhoto).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<Harness />)

    await user.upload(screen.getByLabelText('Choose a photo'), photoFile())
    expect(screen.getByRole('status')).toHaveTextContent('Checking your photo…')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    finish(prepared)

    await waitFor(() => expect(forgetPhoto).toHaveBeenCalledWith('blob:navy-shirt'))
    expect(useWardrobeStore.getState().uploads).toEqual([])
  })
})
