import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { homePose, nearestAngle, STAGE_INSETS } from './camera-views'

const turn = Math.PI * 2

/** Projects a world point to canvas pixels (y down) for a camera at the given pose. */
function project(width: number, height: number, point: Vector3) {
  const pose = homePose(width, height)
  const camera = new PerspectiveCamera(30, width / height, 0.1, 40)
  camera.position.set(...pose.position)
  camera.lookAt(...pose.target)
  camera.updateMatrixWorld()
  const ndc = point.clone().project(camera)
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height }
}

describe('homePose', () => {
  it.each([
    ['phone', 375, 520],
    ['tablet', 768, 640],
    ['desktop', 1100, 860],
  ])('keeps head and feet clear of the overlays on a %s stage', (_, width, height) => {
    const head = project(width, height, new Vector3(0, 1.77, 0))
    const feet = project(width, height, new Vector3(0, 0, 0.12))
    expect(head.y).toBeGreaterThan(STAGE_INSETS.top)
    expect(feet.y).toBeLessThan(height - STAGE_INSETS.bottom)
  })

  it('keeps the shoulders inside a narrow stage', () => {
    const shoulder = project(320, 700, new Vector3(0.25, 1.4, 0))
    expect(shoulder.x).toBeLessThan(320)
  })
})

describe('nearestAngle', () => {
  it('keeps an angle that is already nearest', () => {
    expect(nearestAngle(0.2, Math.PI / 2)).toBeCloseTo(Math.PI / 2)
  })

  it('does not unwind full turns after spinning', () => {
    expect(nearestAngle(3 * turn + 0.1, 0)).toBeCloseTo(3 * turn)
    expect(nearestAngle(-2 * turn - 0.1, 0)).toBeCloseTo(-2 * turn)
  })

  it('turns the short way across the seam', () => {
    expect(nearestAngle(turn - 0.1, Math.PI / 2)).toBeCloseTo(turn + Math.PI / 2)
    expect(nearestAngle(0.1, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2)
  })
})
