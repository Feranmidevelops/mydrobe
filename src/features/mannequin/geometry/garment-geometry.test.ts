import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { GARMENT_TEMPLATES } from '../../garments/garment.templates'
import type { GarmentTemplateId } from '../../garments/garment.types'
import { createBodyShape, limbTransform, SHOULDER_SQUASH } from '../body-shape'
import { BODY_PRESETS } from '../viewer.types'
import {
  buildGarmentGeometry,
  SHIRT_DRAPE,
  SHIRT_HEM_Y,
  shirtTorsoRings,
  shoulderCapHeight,
  trouserLegRings,
  TROUSER_WAIST_EASE,
  TROUSER_WAIST_Y,
  type TorsoProfile,
} from './garment-geometry'
import { inflateRings, ringAt, type Ring } from './loft'

const templateIds = Object.keys(GARMENT_TEMPLATES) as GarmentTemplateId[]

const frontOf = (ring: Ring) => (ring.cz ?? 0) + ring.rz
const backOf = (ring: Ring) => (ring.cz ?? 0) - ring.rz

/**
 * Where a point sits against a shirt's torso at its height: below 1 is inside.
 * `margin` shrinks the shirt first, to ask for that much clearance.
 */
function shirtReach(torso: TorsoProfile, point: Vector3, margin = 0) {
  const front = ringAt(torso.front, point.y)
  const ring = point.z >= (front.cz ?? 0) ? front : ringAt(torso.back, point.y)
  return (point.x / (ring.rx - margin)) ** 2 + ((point.z - (ring.cz ?? 0)) / (ring.rz - margin)) ** 2
}

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
    const { front, back } = shirtTorsoRings(shape, 'short')
    for (let i = 0; i < front.length - 1; i++) {
      const give = SHIRT_DRAPE * (front[i + 1].y - front[i].y) + 1e-9
      expect(frontOf(front[i])).toBeGreaterThanOrEqual(frontOf(front[i + 1]) - give)
      expect(backOf(back[i])).toBeLessThanOrEqual(backOf(back[i + 1]) + give)
      expect(front[i].rx).toBeGreaterThanOrEqual(front[i + 1].rx - give)
    }
  })

  it('joins the front and back of the shirt at its sides', () => {
    const { front, back } = shirtTorsoRings(shape, 'long')
    front.forEach((ring, i) => {
      expect([ring.y, ring.rx, ring.cz]).toEqual([back[i].y, back[i].rx, back[i].cz])
    })
  })

  it('keeps the shirt outside the body', () => {
    const { front, back } = shirtTorsoRings(shape, 'long')
    front.forEach((ring, i) => {
      const body = ringAt(shape.torso, ring.y)
      expect(ring.rx).toBeGreaterThan(body.rx)
      expect(frontOf(ring)).toBeGreaterThan(frontOf(body))
      expect(backOf(back[i])).toBeLessThan(backOf(body))
    })
  })

  it.each(['long', 'short'] as const)('covers the trouser waist all the way round under a %s-sleeve shirt', (sleeve) => {
    const torso = shirtTorsoRings(shape, sleeve)
    for (let y = SHIRT_HEM_Y[sleeve] + 0.005; y <= TROUSER_WAIST_Y; y += 0.01) {
      const [waist] = inflateRings([ringAt(shape.torso, y)], TROUSER_WAIST_EASE)
      for (let i = 0; i < 64; i++) {
        const theta = (i / 64) * Math.PI * 2
        const point = new Vector3(waist.rx * Math.cos(theta), y, (waist.cz ?? 0) + waist.rz * Math.sin(theta))
        expect(shirtReach(torso, point, 0.003)).toBeLessThan(1)
      }
    }
  })

  it('lays the sleeve cap close over the top of the shoulder, like fabric rather than padding', () => {
    // Measured up from the shoulder joint, like the mannequin's own shoulder.
    const shoulderTop = shape.shoulderRadius * SHOULDER_SQUASH
    expect(shoulderCapHeight(shape)).toBeGreaterThan(shoulderTop)
    expect(shoulderCapHeight(shape) - shoulderTop).toBeLessThanOrEqual(0.006)
  })

  it.each(['long', 'short'] as const)('lets a %s-sleeve shirt hem hang over the trouser legs', (sleeve) => {
    // Untucked shirts must stay outside the trousers where the two overlap.
    const hemY = SHIRT_HEM_Y[sleeve]
    const torso = shirtTorsoRings(shape, sleeve)
    const leg = trouserLegRings(shape)
    const transform = limbTransform(shape.leg, 1)
    const distance = (shape.leg.joint[1] - hemY - 0.005) / Math.cos(shape.leg.abduction)
    const ring = ringAt(leg, -distance)

    for (let i = 0; i < 32; i++) {
      const theta = (i / 32) * Math.PI * 2
      const point = new Vector3(
        ring.rx * Math.cos(theta),
        ring.y,
        (ring.cz ?? 0) + ring.rz * Math.sin(theta),
      ).applyMatrix4(transform)
      expect(shirtReach(torso, point)).toBeLessThan(1)
    }
  })
})
