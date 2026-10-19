import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { GARMENT_TEMPLATES } from '../../garments/garment.templates'
import type { GarmentTemplateId } from '../../garments/garment.types'
import { createBodyShape, limbTransform } from '../body-shape'
import { BODY_PRESETS } from '../viewer.types'
import {
  buildGarmentGeometry,
  SHIRT_DRAPE,
  SHIRT_HEM_Y,
  shirtTorsoRings,
  trouserLegRings,
} from './garment-geometry'
import { ringAt, type Ring } from './loft'

const templateIds = Object.keys(GARMENT_TEMPLATES) as GarmentTemplateId[]

describe.each(BODY_PRESETS)('%s garments', (preset) => {
  const shape = createBodyShape(preset)

  it.each(templateIds)('builds %s with finite geometry and a symmetric front panel', (templateId) => {
    const { front, rest, panel } = buildGarmentGeometry(templateId, shape)
    for (const geometry of [front, rest]) {
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
    }
    expect(panel.minX).toBeCloseTo(-panel.maxX, 5)
    expect(panel.maxY).toBeGreaterThan(panel.minY)
  })

  it.each(templateIds)('maps the front image of %s inside the 0–1 UV square', (templateId) => {
    const uv = buildGarmentGeometry(templateId, shape).front.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6)
      expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6)
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-1e-6)
      expect(uv.getY(i)).toBeLessThanOrEqual(1 + 1e-6)
    }
  })

  it('lets a shirt fall from the chest and belly instead of tucking in under them', () => {
    const rings = shirtTorsoRings(shape, 'short')
    const front = (ring: Ring) => (ring.cz ?? 0) + ring.rz
    const back = (ring: Ring) => (ring.cz ?? 0) - ring.rz
    for (let i = 0; i < rings.length - 1; i++) {
      const [ring, above] = [rings[i], rings[i + 1]]
      const give = SHIRT_DRAPE * (above.y - ring.y) + 1e-9
      expect(front(ring)).toBeGreaterThanOrEqual(front(above) - give)
      expect(back(ring)).toBeLessThanOrEqual(back(above) + give)
      expect(ring.rx).toBeGreaterThanOrEqual(above.rx - give)
    }
  })

  it('keeps the shirt outside the body', () => {
    for (const ring of shirtTorsoRings(shape, 'long')) {
      const body = ringAt(shape.torso, ring.y)
      expect(ring.rx).toBeGreaterThan(body.rx)
      expect((ring.cz ?? 0) + ring.rz).toBeGreaterThan((body.cz ?? 0) + body.rz)
      expect((ring.cz ?? 0) - ring.rz).toBeLessThan((body.cz ?? 0) - body.rz)
    }
  })

  it.each(['long', 'short'] as const)('lets a %s-sleeve shirt hem hang over the trouser legs', (sleeve) => {
    // Untucked shirts must stay outside the trousers where the two overlap.
    const hemY = SHIRT_HEM_Y[sleeve]
    const hem = ringAt(shirtTorsoRings(shape, sleeve), hemY + 0.005)
    const leg = trouserLegRings(shape)
    const transform = limbTransform(shape.leg, 1)
    const distance = (shape.leg.joint[1] - hem.y) / Math.cos(shape.leg.abduction)
    const ring = ringAt(leg, -distance)

    for (let i = 0; i < 32; i++) {
      const theta = (i / 32) * Math.PI * 2
      const point = new Vector3(
        ring.rx * Math.cos(theta),
        ring.y,
        (ring.cz ?? 0) + ring.rz * Math.sin(theta),
      ).applyMatrix4(transform)
      const inside =
        (point.x / hem.rx) ** 2 + ((point.z - (hem.cz ?? 0)) / hem.rz) ** 2
      expect(inside).toBeLessThan(1)
    }
  })
})
