export const CAMERA_VIEWS = ['front', 'side', 'back'] as const

export type CameraView = (typeof CAMERA_VIEWS)[number]

export const CAMERA_VIEW_LABELS: Record<CameraView, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
}

/** Azimuth of each view; 0 looks at the mannequin's front from +z. */
export const VIEW_AZIMUTH: Record<CameraView, number> = {
  front: 0,
  side: Math.PI / 2,
  back: Math.PI,
}

export const CAMERA_FOV = 30

/** Slightly above eye level, measured from straight down. */
export const HOME_POLAR = Math.PI * 0.47

/** World-space extent the home view keeps in frame: the figure plus its plinth. */
const FRAMED = { bottom: -0.03, top: 1.8, halfWidth: 0.45 }

/** Canvas pixels covered by overlaid UI: the preset switcher at the bottom. */
export const STAGE_INSETS = { top: 24, bottom: 104 }

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

/**
 * The home view for a canvas of the given size: far enough back that the
 * whole figure fits between the overlaid controls, and centred in that band.
 */
export function homePose(width: number, height: number, fov = CAMERA_FOV): CameraPose {
  const tanHalf = Math.tan((fov * Math.PI) / 360)
  const safeHeight = Math.max(height - STAGE_INSETS.top - STAGE_INSETS.bottom, height * 0.5)
  const framedHeight = FRAMED.top - FRAMED.bottom
  const fitHeight = (framedHeight * height) / safeHeight / 2 / tanHalf
  const fitWidth = FRAMED.halfWidth / (tanHalf * (width / height))
  const distance = Math.max(fitHeight, fitWidth)

  const worldPerPixel = (2 * distance * tanHalf) / height
  const insetShift = ((STAGE_INSETS.bottom - STAGE_INSETS.top) / 2) * worldPerPixel
  const targetY = (FRAMED.top + FRAMED.bottom) / 2 - insetShift

  return {
    position: [0, targetY + distance * Math.cos(HOME_POLAR), distance * Math.sin(HOME_POLAR)],
    target: [0, targetY, 0],
  }
}

/**
 * The equivalent of `desired` closest to `current`, so a view change after
 * several full spins turns the short way instead of unwinding every turn.
 */
export function nearestAngle(current: number, desired: number): number {
  const turn = Math.PI * 2
  const delta = ((((desired - current) % turn) + turn * 1.5) % turn) - turn / 2
  return current + delta
}
