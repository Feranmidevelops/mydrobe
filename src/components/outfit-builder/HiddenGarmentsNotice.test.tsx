import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_GARMENTS } from '../../features/garments/demo-garments'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { HiddenGarmentsNotice } from './HiddenGarmentsNotice'

const initialState = useWardrobeStore.getState()

describe('HiddenGarmentsNotice', () => {
  beforeEach(() => {
    useWardrobeStore.setState(initialState, true)
  })

  it('stays silent when everything worn can be drawn', () => {
    useWardrobeStore.setState({ selection: { shirt: 'demo-oxford-stripe', trousers: 'demo-indigo-denim' } })
    const { container } = render(<HiddenGarmentsNotice garments={DEMO_GARMENTS} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names a worn item that has no 3D template', () => {
    useWardrobeStore.setState({ selection: { shirt: 'demo-oxford-stripe', outerwear: 'demo-camel-overcoat' } })
    render(<HiddenGarmentsNotice garments={DEMO_GARMENTS} />)
    expect(screen.getByRole('status')).toHaveTextContent("Camel wool overcoat isn't shown in 3D yet")
  })
})
