import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import type { Garment } from '../../features/garments/garment.types'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { FittingStatus } from './FittingStatus'

const initialState = useWardrobeStore.getState()

const upload = (id: string, name: string, category: 'shirt' | 'trousers'): Garment => ({
  id,
  name,
  category,
  templateId: category === 'shirt' ? 'shirt-long-sleeve' : 'trousers-straight',
  source: { kind: 'photo', url: `blob:${id}` },
  tags: ['upload'],
  createdAt: 0,
  updatedAt: 0,
})

const navyShirt = upload('navy-shirt', 'Navy shirt', 'shirt')
const cordTrousers = upload('cord-trousers', 'Cord trousers', 'trousers')
const garments = [navyShirt, cordTrousers, ...DEMO_GARMENTS]

describe('FittingStatus', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('says which worn piece is still being fitted', () => {
    useWardrobeStore.setState({ selection: { shirt: navyShirt.id }, fitting: { [navyShirt.id]: 'loading' } })
    render(<FittingStatus garments={garments} />)

    expect(screen.getByRole('status')).toHaveTextContent('Fitting Navy shirt…')
  })

  it('stays quiet about pieces that are not on the mannequin', () => {
    useWardrobeStore.setState({ selection: {}, fitting: { [navyShirt.id]: 'loading' } })
    render(<FittingStatus garments={garments} />)

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('explains when a photo could not be fitted', () => {
    useWardrobeStore.setState({
      selection: { shirt: navyShirt.id, trousers: cordTrousers.id },
      fitting: { [navyShirt.id]: 'failed', [cordTrousers.id]: 'failed' },
    })
    render(<FittingStatus garments={garments} />)

    expect(screen.getByRole('note')).toHaveTextContent(
      "Navy shirt, Cord trousers couldn't be fitted from their photos, so they show in plain colour.",
    )
  })
})
