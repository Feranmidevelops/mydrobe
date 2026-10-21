import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { GARMENT_TEMPLATES } from '../../garments/garment.templates'
import type { GarmentTemplateId } from '../../garments/garment.types'
import { createBodyShape, limbTransform, SHOULDER_SQUASH } from '../body-shape'
import { BODY_PRESETS } from '../viewer.types'
import {
  buildGarmentGeometry,
  COLLAR,
  COLLAR_OPENING,
  SHIRT_DRAPE,
  SHIRT_HEM_Y,
  shirtCollar,
  shirtTorsoRings,
  sleeveRings,
  shoulderCap,
  trouserLegRings,
  TROUSER_WAIST_EASE,
  TROUSER_WAIST_Y,
  type TorsoProfile,
} from './garment-geometry'
import { buildLoft, inflateRings, ringAt, type Ring } from './loft'

const templateIds = Object.keys(GARMENT_TEMPLATES) as GarmentTemplateId[]

const frontOf = (ring: Ring) => (ring.cz ?? 0) + ring.rz
const backOf = (ring: Ring) => (ring.cz ?? 0) - ring.rz
const topOf = (rings: Ring[]) => rings[rings.length - 1]
const pointOn = (ring: Ring, theta: number) =>
  new Vector3(
    (ring.cx ?? 0) + ring.rx * Math.cos(theta),
    ring.y,
    (ring.cz ?? 0) + ring.rz * Math.sin(theta),
  )

/** The triangles of a geometry that reach above `y`, as a mesh rays can hit from either side. */
function meshAbove(geometry: BufferGeometry, y: number) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const kept: number[] = []
  for (let i = 0; i < (index ? index.count : position.count); i += 3) {
    const corners = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k))
    if (Math.max(...corners.map((c) => position.getY(c))) < y) continue
    for (const c of corners) kept.push(position.getX(c), position.getY(c), position.getZ(c))
  }
  const part = new BufferGeometry()
  part.setAttribute('position', new Float32BufferAttribute(kept, 3))
  return new Mesh(part, new MeshBasicMaterial({ side: DoubleSide }))
}

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
      // Above the top of the torso, the body is the neck.
      const body = ringAt(ring.y > topOf(shape.torso).y ? shape.neck : shape.torso, ring.y)
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

  it('gives a long-sleeve shirt a collar that stands tallest at the back and opens at the front', () => {
    const neckline = topOf(shirtTorsoRings(shape, 'long').back)
    const position = shirtCollar(shape, neckline).getAttribute('position')
    let backTop = -Infinity
    let frontTop = -Infinity
    for (let i = 0; i < position.count; i++) {
      // Measured round the neck, with a quarter turn facing the front.
      const angle = Math.atan2(position.getZ(i), position.getX(i))
      expect(Math.abs(angle - Math.PI / 2)).toBeGreaterThan(COLLAR_OPENING - 0.05)
      if (Math.sin(angle) < -0.9) backTop = Math.max(backTop, position.getY(i))
      if (Math.sin(angle) > 0.3) frontTop = Math.max(frontTop, position.getY(i))
    }
    expect(backTop).toBeCloseTo(neckline.y + COLLAR.backRise, 3)
    expect(frontTop).toBeLessThan(backTop - 0.015)
  })

  it.each(['long', 'short'] as const)('closes a %s-sleeve shirt round the base of the neck', (sleeve) => {
    const top = topOf(shirtTorsoRings(shape, sleeve).front)
    const neck = ringAt(shape.neck, top.y)
    for (const gap of [top.rx - neck.rx, top.rz - neck.rz]) {
      expect(gap).toBeGreaterThanOrEqual(0.003)
      expect(gap).toBeLessThanOrEqual(0.008)
    }
  })

  it.each(['long', 'short'] as const)(
    'keeps the top of the torso and the base of the neck inside a %s-sleeve shirt',
    (sleeve) => {
      const torso = shirtTorsoRings(shape, sleeve)
      const shirtTop = topOf(torso.front).y
      const torsoTop = topOf(shape.torso).y
      for (const [profile, upTo] of [
        [shape.torso, torsoTop],
        [shape.neck, shirtTop],
      ] as const) {
        for (let y = 1.42; y <= upTo + 1e-9; y += 0.001) {
          const ring = ringAt(profile, Math.min(y, upTo))
          for (let i = 0; i < 64; i++) {
            const point = pointOn(ring, ((i + 0.5) / 64) * Math.PI * 2)
            expect(point.y).toBeLessThanOrEqual(shirtTop)
            expect(shirtReach(torso, point, 0.001)).toBeLessThan(1)
          }
        }
      }
    },
  )

  it.each(templateIds.filter((id) => id.startsWith('shirt')))(
    'leaves no gap round the neck of %s that shows the mannequin, even from above',
    (templateId) => {
      // Whatever the camera can see the top of the torso from (as high as the
      // controls go, and higher), the shirt or the neck is in the way.
      const { front, rest } = buildGarmentGeometry(templateId, shape)
      const torsoTop = topOf(shape.torso)
      const occluders = [front, rest, buildLoft(shape.neck, { radialSegments: 24, capEnd: true })].map((part) =>
        meshAbove(part, torsoTop.y - 0.001),
      )
      const neck = ringAt(shape.neck, torsoTop.y)
      const raycaster = new Raycaster()
      for (let i = 0; i < 32; i++) {
        const theta = ((i + 0.5) / 32) * Math.PI * 2
        const [inner, outer] = [pointOn(neck, theta), pointOn(torsoTop, theta)]
        for (const along of [0.15, 0.5, 0.85]) {
          const target = inner.clone().lerp(outer, along)
          target.y += 1e-4
          for (const polar of [0, 0.18, 0.3, 0.47].map((share) => share * Math.PI)) {
            for (let j = 0; j < (polar === 0 ? 1 : 8); j++) {
              const azimuth = (j / 8) * Math.PI * 2
              const towards = new Vector3(
                -Math.sin(polar) * Math.sin(azimuth),
                -Math.cos(polar),
                -Math.sin(polar) * Math.cos(azimuth),
              )
              raycaster.set(target.clone().addScaledVector(towards, -0.5), towards)
              raycaster.far = 0.5 - 1e-4
              expect(raycaster.intersectObjects(occluders, false).length).toBeGreaterThan(0)
            }
          }
        }
      }
    },
  )

  it('starts the collar on the shirt’s top edge, so no gap opens between them', () => {
    const top = topOf(shirtTorsoRings(shape, 'long').back)
    const position = shirtCollar(shape, top).getAttribute('position')
    // The collar's lowest ring is its first 33 points.
    for (let i = 0; i < 33; i++) {
      const point = new Vector3().fromBufferAttribute(position, i)
      const theta = Math.atan2((point.z - (top.cz ?? 0)) / top.rz, point.x / top.rx)
      const onTop = pointOn(top, theta)
      expect(Math.abs(point.y - top.y)).toBeLessThan(0.001)
      expect(Math.hypot(point.x - onTop.x, point.z - onTop.z)).toBeLessThan(0.001)
    }
  })

  it.each(['long', 'short'] as const)(
    'covers the shoulder with a %s-sleeve cap that lies close, like fabric rather than padding',
    (sleeve) => {
      const torso = shirtTorsoRings(shape, sleeve)
      const rings = sleeveRings(shape, sleeve)
      const top = rings[rings.length - 1]
      const cap = shoulderCap(shape, 1, top)
      const toArm = limbTransform(shape.arm, 1).invert()
      const inArm = (point: Vector3) => point.clone().applyMatrix4(toArm)

      // In the arm's frame the cap rises from the sleeve's opening, and its rim
      // sits exactly on the opening, so no ledge shows where the two meet.
      const position = cap.getAttribute('position')
      let height = 0
      for (let i = 0; i < position.count; i++) {
        const local = inArm(new Vector3().fromBufferAttribute(position, i))
        expect(local.y).toBeGreaterThan(top.y - 1e-6)
        if (Math.abs(local.y - top.y) < 1e-6) {
          expect((local.x / top.rx) ** 2 + (local.z / top.rz) ** 2).toBeCloseTo(1, 4)
        }
        height = Math.max(height, local.y - top.y)
      }
      const inSleeve = (point: Vector3) => {
        const local = inArm(point)
        const ring = local.y > top.y ? top : ringAt(rings, local.y)
        const rise = local.y > top.y ? ((local.y - top.y) / height) ** 2 : 0
        return (local.x / ring.rx) ** 2 + (local.z / ring.rz) ** 2 + rise < 1
      }

      // Every point of the mannequin's shoulder above the joint is under the cap or inside the shirt.
      const [x, y, z] = shape.arm.joint
      const r = shape.shoulderRadius
      for (let i = 0; i < 32; i++) {
        for (let j = 0; j <= 8; j++) {
          const around = (i / 32) * Math.PI * 2
          const up = (j / 8) * (Math.PI / 2)
          const point = new Vector3(
            x + r * Math.cos(up) * Math.cos(around),
            y + r * SHOULDER_SQUASH * Math.sin(up),
            z + r * Math.cos(up) * Math.sin(around),
          )
          expect(inSleeve(point) || shirtReach(torso, point) < 1).toBe(true)
        }
      }

      cap.computeBoundingBox()
      const above = cap.boundingBox!.max.y - (y + r * SHOULDER_SQUASH)
      expect(above).toBeGreaterThan(0)
      expect(above).toBeLessThanOrEqual(0.008)
    },
  )

  it('runs the sleeve fabric on over the shoulder cap, unstretched and the same way round', () => {
    const rings = sleeveRings(shape, 'short')
    const top = rings[rings.length - 1]
    const cap = shoulderCap(shape, 1, top)
    const position = cap.getAttribute('position')
    const uv = cap.getAttribute('uv')
    const toArm = limbTransform(shape.arm, 1).invert()
    const radius = (top.rx + top.rz) / 2
    // The dome is a grid of 9 rings of 25 points, from its top down to its rim.
    const at = (ring: number, point: number) => ring * 25 + point
    const where = (i: number) => new Vector3().fromBufferAttribute(position, i)

    for (let ring = 0; ring < 8; ring++) {
      for (let point = 0; point < 25; point += 3) {
        // Up and down the dome, the fabric moves as far as the surface does.
        const [a, b] = [at(ring, point), at(ring + 1, point)]
        const across = where(a).distanceTo(where(b))
        expect(Math.abs(uv.getY(a) - uv.getY(b)) / across).toBeGreaterThan(0.9)
        expect(Math.abs(uv.getY(a) - uv.getY(b)) / across).toBeLessThan(1.1)
      }
    }
    for (let point = 1; point < 24; point++) {
      // Round the rim, the fabric sits where the sleeve's own does: the right arm's seam faces the body.
      const local = where(at(8, point)).applyMatrix4(toArm)
      let theta = Math.atan2(local.z / top.rz, local.x / top.rx)
      while (theta < Math.PI) theta += Math.PI * 2
      expect(uv.getX(at(8, point))).toBeCloseTo(theta * radius, 4)
      expect(uv.getY(at(8, point))).toBeCloseTo(top.y, 6)
    }
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
