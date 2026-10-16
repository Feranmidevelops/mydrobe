import type { BodyPreset } from '../features/mannequin/viewer.types'

export interface CaptureFigure {
  preset: BodyPreset
  /** Demo garment ids to dress the figure in. */
  wearing: string[]
  /** Floor position as [x, z] in metres. */
  position: [number, number]
  /** Rotation about the vertical axis; positive turns the figure to its left. */
  turn: number
}

export interface CaptureShot {
  /** Output size in pixels; roughly twice the size the image is shown at. */
  width: number
  height: number
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    fov: number
  }
  shadowScale: number
  figures: CaptureFigure[]
}

/**
 * Still images for the landing page, rendered from the same mannequin and
 * garment templates the fitting room uses.
 */
export const CAPTURE_SHOTS = {
  'hero-lineup': {
    width: 2400,
    height: 1050,
    camera: { position: [0, 1.05, 4.2], target: [0, 0.92, 0], fov: 30 },
    shadowScale: 6,
    figures: [
      {
        preset: 'medium',
        wearing: ['demo-charcoal-tee', 'demo-stone-chinos'],
        position: [-1.8, -0.25],
        turn: 0.45,
      },
      {
        preset: 'small',
        wearing: ['demo-oxford-stripe', 'demo-indigo-denim'],
        position: [-0.6, 0.05],
        turn: 0.15,
      },
      {
        preset: 'large',
        wearing: ['demo-gingham', 'demo-black-trousers'],
        position: [0.6, 0],
        turn: -0.15,
      },
      {
        preset: 'medium',
        wearing: ['demo-linen-tee', 'demo-indigo-denim'],
        position: [1.8, -0.25],
        turn: -0.45,
      },
    ],
  },
  'body-small': portrait('small', ['demo-linen-tee', 'demo-indigo-denim']),
  'body-medium': portrait('medium', ['demo-oxford-stripe', 'demo-stone-chinos']),
  'body-large': portrait('large', ['demo-gingham', 'demo-stone-chinos']),
} satisfies Record<string, CaptureShot>

export type CaptureShotName = keyof typeof CAPTURE_SHOTS

function portrait(preset: BodyPreset, wearing: string[]): CaptureShot {
  return {
    width: 800,
    height: 1066,
    camera: { position: [0, 1, 4], target: [0, 0.9, 0], fov: 30 },
    shadowScale: 2,
    figures: [{ preset, wearing, position: [0, 0], turn: 0.35 }],
  }
}
