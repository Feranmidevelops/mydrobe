import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analysePhotoAt } from '../../features/garments/analyse-photo'
import { PhotoMappingError, type PhotoAnalysis } from '../../features/garments/photo-analysis'
import type { Rect } from '../../features/garments/photo-mapping'
import { GarmentReview } from './GarmentReview'

vi.mock('../../features/garments/analyse-photo', () => ({
  analysePhotoAt: vi.fn(),
  forgetPhoto: vi.fn(),
}))

const photo = { url: 'blob:navy-shirt' }

function navyAnalysis(bounds: Rect = { x: 20, y: 10, width: 60, height: 80 }): PhotoAnalysis {
  const pixels = (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height })
  return {
    image: pixels(100, 100),
    mask: new Uint8Array(100 * 100),
    background: [240, 240, 240],
    bounds,
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

function renderReview() {
  const onAdd = vi.fn(async () => {})
  const onChooseAnother = vi.fn()
  render(<GarmentReview photo={photo} onAdd={onAdd} onChooseAnother={onChooseAnother} />)
  return { onAdd, onChooseAnother }
}

const addButton = () => screen.getByRole('button', { name: 'Add to wardrobe' })

describe('GarmentReview', () => {
  beforeEach(() => {
    vi.mocked(analysePhotoAt).mockReset()
  })

  it('suggests a name from the main colour and adds the shirt with its details', async () => {
    const user = userEvent.setup()
    const analysis = navyAnalysis()
    vi.mocked(analysePhotoAt).mockResolvedValue(analysis)
    const { onAdd } = renderReview()

    expect(await screen.findByDisplayValue('Navy shirt')).toBeInTheDocument()
    await user.click(addButton())

    expect(onAdd).toHaveBeenCalledWith(
      { name: 'Navy shirt', category: 'shirt', templateId: 'shirt-long-sleeve', backgroundTolerance: 70 },
      analysis,
    )
  })

  it('follows the sleeves in its suggestion but keeps a name the person typed', async () => {
    const user = userEvent.setup()
    vi.mocked(analysePhotoAt).mockResolvedValue(navyAnalysis())
    const { onAdd } = renderReview()
    await screen.findByDisplayValue('Navy shirt')

    await user.click(screen.getByRole('radio', { name: 'Short' }))
    expect(await screen.findByDisplayValue('Navy tee')).toBeInTheDocument()

    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Weekend tee')
    await user.click(screen.getByRole('radio', { name: 'Trousers' }))
    await waitFor(() => expect(addButton()).toBeEnabled())
    await user.click(addButton())

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Weekend tee', category: 'trousers', templateId: 'trousers-straight' }),
      expect.anything(),
    )
  })

  it('keeps pieces without a 3D template off the mannequin, analysing them by outline', async () => {
    const user = userEvent.setup()
    vi.mocked(analysePhotoAt).mockResolvedValue(navyAnalysis())
    const { onAdd } = renderReview()
    await screen.findByDisplayValue('Navy shirt')

    await user.click(screen.getByRole('radio', { name: 'Outerwear' }))

    expect(screen.getByRole('note')).toHaveTextContent("won't show on the mannequin")
    expect(screen.queryByRole('radio', { name: 'Short' })).not.toBeInTheDocument()
    expect(analysePhotoAt).toHaveBeenLastCalledWith(photo.url, expect.any(Function), 'trousers-straight', 70)
    await waitFor(() => expect(addButton()).toBeEnabled())
    await user.click(addButton())
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Navy jacket', category: 'outerwear', templateId: null }),
      expect.anything(),
    )
  })

  it('analyses again once the background slider comes to rest', async () => {
    const user = userEvent.setup()
    vi.mocked(analysePhotoAt).mockResolvedValue(navyAnalysis())
    const { onAdd } = renderReview()
    await screen.findByDisplayValue('Navy shirt')

    fireEvent.change(screen.getByLabelText('Background removal'), { target: { value: '100' } })
    expect(addButton()).toBeDisabled()

    await waitFor(() =>
      expect(analysePhotoAt).toHaveBeenLastCalledWith(photo.url, expect.any(Function), 'shirt-long-sleeve', 100),
    )
    await waitFor(() => expect(addButton()).toBeEnabled())
    await user.click(addButton())
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ backgroundTolerance: 100 }), expect.anything())
  })

  it('explains when no garment can be found, and offers another photo', async () => {
    const user = userEvent.setup()
    vi.mocked(analysePhotoAt).mockRejectedValue(new PhotoMappingError("Couldn't find a garment in this photo."))
    const { onChooseAnother } = renderReview()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't find a garment in this photo.")
    expect(alert).toHaveTextContent('plainer background')
    expect(addButton()).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Choose another photo' }))
    expect(onChooseAnother).toHaveBeenCalled()
  })

  it('mentions a garment that runs off the edge of the photo', async () => {
    vi.mocked(analysePhotoAt).mockResolvedValue(navyAnalysis({ x: 0, y: 10, width: 60, height: 80 }))
    renderReview()

    expect(await screen.findByText(/cut off at the edge/)).toBeInTheDocument()
    expect(addButton()).toBeEnabled()
  })

  it('holds both buttons while the piece is being added', async () => {
    const user = userEvent.setup()
    vi.mocked(analysePhotoAt).mockResolvedValue(navyAnalysis())
    const onAdd = vi.fn(() => new Promise<void>(() => {}))
    render(<GarmentReview photo={photo} onAdd={onAdd} onChooseAnother={() => {}} />)
    await screen.findByDisplayValue('Navy shirt')

    await user.click(addButton())

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Choose another photo' })).toBeDisabled()
  })
})
