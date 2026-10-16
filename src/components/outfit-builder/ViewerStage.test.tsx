import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ViewerStage } from './ViewerStage'

describe('ViewerStage', () => {
  it('explains that 3D is unavailable when WebGL is missing', () => {
    // The test setup makes every getContext call return null, like a browser without WebGL.
    render(<ViewerStage />)
    expect(screen.getByRole('status')).toHaveTextContent('3D preview unavailable')
    expect(screen.getByRole('status')).toHaveTextContent(/still browse your wardrobe/i)
  })
})
