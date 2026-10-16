import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createBodyShape, limbPoint } from './body-shape'
import { buildMannequinGeometry } from './geometry/mannequin-geometry'
import { ringAt } from './geometry/loft'
import { BODY_PRESETS } from './viewer.types'

const bounds = Object.fromEntries(
  BODY_PRESETS.map((preset) => {
    const shape = createBodyShape(preset)
    const geometry = buildMannequinGeometry(shape)
    geometry.computeBoundingBox()
    return [preset, { shape, box: geometry.boundingBox!.clone() as Box3, geometry }]
  }),
)

describe.each(BODY_PRESETS)('%s mannequin', (preset) => {
  const { shape, box, geometry } = bounds[preset]

  it('stands on the floor at an adult height', () => {
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y * shape.scale).toBeGreaterThan(1.65)
    expect(box.max.y * shape.scale).toBeLessThan(1.8)
  })

  it('is symmetric left to right', () => {
    expect(box.min.x).toBeCloseTo(-box.max.x, 5)
  })

  it('has only finite vertex data', () => {
    const positions = geometry.getAttribute('position').array
    const normals = geometry.getAttribute('normal').array
    expect(Array.from(positions).every(Number.isFinite)).toBe(true)
    expect(Array.from(normals).every(Number.isFinite)).toBe(true)
  })

  it('hangs the arms clear of the hips and waist', () => {
    for (const distance of [0.29, 0.45, shape.arm.length]) {
      const point = limbPoint(shape.arm, 1, distance)
      const arm = ringAt(shape.arm.rings, -distance)
      const torso = ringAt(shape.torso, point.y)
      expect(point.x - arm.rx).toBeGreaterThan(torso.rx + 0.02)
    }
  })
})

describe('body presets', () => {
  it('grow wider from small to medium to large', () => {
    const waist = (preset: (typeof BODY_PRESETS)[number]) =>
      ringAt(bounds[preset].shape.torso, 1.09).rx * bounds[preset].shape.scale
    expect(waist('small')).toBeLessThan(waist('medium'))
    expect(waist('medium')).toBeLessThan(waist('large'))
  })
})
