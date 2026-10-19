import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GarmentTemplateId } from '../../garments/garment.types'
import { limbTransform, SHOULDER_SQUASH, SIDES, type BodyShape, type Side } from '../body-shape'
import { buildLoft, inflateRings, sliceRings, type LoftUv, type Ring } from './loft'

/** The body-space rectangle a front-facing garment image is projected onto. */
export interface FrontPanel {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Every template is split into two surfaces:
 * - `front` takes a front-facing image, projected straight on like a photo;
 * - `rest` (back, sleeves, collar) takes a tiling fabric swatch, because a
 *   single front photo says nothing reliable about the back.
 * Swatch UVs are in metres, so the texture's repeat sets the fabric scale.
 */
export interface GarmentGeometry {
  front: BufferGeometry
  rest: BufferGeometry
  panel: FrontPanel
}

/** Shirt hems sit this far below the hip, flaring out to clear the trousers. */
export const SHIRT_HEM_Y = { long: 0.81, short: 0.86 } as const
export const SHIRT_EASE = 0.016
export const SHIRT_HEM_FLARE = 0.012
export const TROUSER_EASE = 0.012
export const TROUSER_WAIST_EASE = 0.01
export const TROUSER_WAIST_Y = 1.08
const NECK_BASE_Y = 1.455
const HIP_Y = 0.95
const KNEE_D = 0.36

const FRONT_HALF = { thetaStart: 0, thetaLength: Math.PI }
const BACK_HALF = { thetaStart: Math.PI, thetaLength: Math.PI }

/** Torso fabric: arc length measured from the centre back, and height. */
const torsoSwatchUv: LoftUv = (world, theta, ring) => [
  ((theta - 1.5 * Math.PI) * (ring.rx + ring.rz)) / 2,
  world.y,
]

/** Sleeve and leg fabric: arc length round the limb, and position along it. */
const limbSwatchUv: LoftUv = (_, theta, ring) => [(theta * (ring.rx + ring.rz)) / 2, ring.y]

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Puts the sleeve seam on the side facing the body. */
function seamTowardsBody(side: Side) {
  return side > 0 ? Math.PI : 0
}

/** How far fabric can slope inwards below a fuller part of the body, in metres per metre of drop. */
export const SHIRT_DRAPE = 0.08

/**
 * A shirt's torso as two half-profiles that meet at the sides: same heights,
 * widths and centres, but the front can stand further out than the back.
 */
export interface TorsoProfile {
  front: Ring[]
  back: Ring[]
}

/**
 * Lets fabric fall from the fullest parts of the body, such as the chest,
 * belly and seat, instead of tucking in under them: going down from the neck,
 * the front, back and sides can only move in gently. The front and back hang
 * separately, so a belly pushes the front out without pulling the back in.
 * Rings are in ascending height.
 */
export function hang(rings: Ring[], slope = SHIRT_DRAPE): TorsoProfile {
  const front = rings.map((ring) => ({ ...ring }))
  const back = rings.map((ring) => ({ ...ring }))
  for (let i = rings.length - 2; i >= 0; i--) {
    const give = slope * (rings[i + 1].y - rings[i].y)
    const cz = rings[i].cz ?? 0
    const frontAbove = (rings[i + 1].cz ?? 0) + front[i + 1].rz
    const backAbove = (rings[i + 1].cz ?? 0) - back[i + 1].rz
    front[i].rz = Math.max(rings[i].rz, frontAbove - give - cz)
    back[i].rz = Math.max(rings[i].rz, cz - backAbove - give)
    front[i].rx = back[i].rx = Math.max(rings[i].rx, front[i + 1].rx - give)
  }
  return { front, back }
}

export function shirtTorsoRings(shape: BodyShape, sleeve: 'long' | 'short'): TorsoProfile {
  const hemY = SHIRT_HEM_Y[sleeve]
  const { front, back } = hang(sliceRings(shape.torso, hemY, NECK_BASE_Y, 30))
  const loosen = (ring: Ring) => {
    const flare = SHIRT_HEM_FLARE * smoothstep(HIP_Y, hemY, ring.y)
    return inflateRings([ring], SHIRT_EASE + flare)[0]
  }
  return { front: front.map(loosen), back: back.map(loosen) }
}

export function trouserLegRings(shape: BodyShape): Ring[] {
  const hemD = shape.leg.length - 0.04
  const rings = inflateRings(sliceRings(shape.leg.rings, -hemD, 0, 26), TROUSER_EASE)
  // Straight leg: below the knee the trouser never narrows past the calf.
  const lower = rings.filter((ring) => -ring.y >= KNEE_D)
  const rx = Math.max(...lower.map((ring) => ring.rx))
  const rz = Math.max(...lower.map((ring) => ring.rz))
  return rings.map((ring) =>
    -ring.y >= KNEE_D ? { ...ring, rx: Math.max(ring.rx, rx), rz: Math.max(ring.rz, rz) } : ring,
  )
}

/** How far a sleeve's cap sits above the top of the shoulder; fabric lies flat there, with no ease. */
export const SHOULDER_TOP_EASE = 0.005

/** A shirt's cap over one shoulder, where the sleeve meets the body. */
export function shoulderCap(shape: BodyShape, side: Side): BufferGeometry {
  const radius = shape.shoulderRadius + SHIRT_EASE
  const height = shape.shoulderRadius * SHOULDER_SQUASH + SHOULDER_TOP_EASE
  const [x, y, z] = shape.arm.joint
  const sphere = new SphereGeometry(radius, 24, 16)
  const uv = sphere.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * radius, uv.getY(i) * Math.PI * radius)
  }
  return sphere.scale(1, height / radius, 1).translate(x * side, y, z)
}

/** Where a shirt collar starts on the neck (hidden inside the shirt), and how high it reaches. */
export const COLLAR = { baseY: 1.43, backTopY: 1.49, frontTopY: 1.465 } as const
/** Half the angle a collar leaves open at the front, where the photo shows the real collar. */
export const COLLAR_OPENING = 0.45

/**
 * A shirt collar: a band round the back and sides of the neck that stands
 * tallest at the back and slopes down towards the front, where it opens.
 */
export function shirtCollar(shape: BodyShape): BufferGeometry {
  const backHeight = COLLAR.backTopY - COLLAR.baseY
  const rings = sliceRings(shape.neck, COLLAR.baseY, COLLAR.backTopY, 4).map((ring, i) => ({
    ...ring,
    rx: ring.rx + 0.012 + i * 0.002,
    rz: ring.rz + 0.012 + i * 0.002,
  }))
  const collar = buildLoft(rings, {
    radialSegments: 32,
    thetaStart: Math.PI / 2 + COLLAR_OPENING,
    thetaLength: 2 * Math.PI - 2 * COLLAR_OPENING,
    uv: torsoSwatchUv,
  })
  const position = collar.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    // 0 at the centre back, 1 at the front.
    const towardsFront = (Math.sin(Math.atan2(position.getZ(i), position.getX(i))) + 1) / 2
    const height = backHeight + (COLLAR.frontTopY - COLLAR.backTopY) * towardsFront
    position.setY(i, COLLAR.baseY + (position.getY(i) - COLLAR.baseY) * (height / backHeight))
  }
  return collar
}

function shirtGeometry(shape: BodyShape, sleeve: 'long' | 'short'): GarmentGeometry {
  const torso = shirtTorsoRings(shape, sleeve)
  const front = [buildLoft(torso.front, { radialSegments: 40, ...FRONT_HALF })]
  const rest = [buildLoft(torso.back, { radialSegments: 40, ...BACK_HALF, uv: torsoSwatchUv })]

  if (sleeve === 'long') rest.push(shirtCollar(shape))

  const sleeveLength = sleeve === 'long' ? shape.arm.length - 0.03 : 0.2
  for (const side of SIDES) {
    const rings = sliceRings(shape.arm.rings, -sleeveLength, 0, 14).map((ring) => {
      const towardsCuff = -ring.y / sleeveLength
      const ease = sleeve === 'long' ? 0.012 : 0.016 + 0.014 * towardsCuff
      return inflateRings([ring], ease)[0]
    })
    rest.push(
      buildLoft(rings, {
        radialSegments: 24,
        thetaStart: seamTowardsBody(side),
        transform: limbTransform(shape.arm, side),
        uv: limbSwatchUv,
      }),
      shoulderCap(shape, side),
    )
  }

  return finish(front, rest)
}

function trousersGeometry(shape: BodyShape): GarmentGeometry {
  const waist = inflateRings(sliceRings(shape.torso, shape.torso[0].y, TROUSER_WAIST_Y, 14), TROUSER_WAIST_EASE)
  const front = [buildLoft(waist, { radialSegments: 40, ...FRONT_HALF, capStart: true })]
  const rest = [
    buildLoft(waist, { radialSegments: 40, ...BACK_HALF, capStart: true, uv: torsoSwatchUv }),
  ]

  const leg = trouserLegRings(shape)
  for (const side of SIDES) {
    const transform = limbTransform(shape.leg, side)
    front.push(buildLoft(leg, { radialSegments: 28, ...FRONT_HALF, transform }))
    rest.push(buildLoft(leg, { radialSegments: 28, ...BACK_HALF, transform, uv: limbSwatchUv }))
  }

  return finish(front, rest)
}

/** Projects the front surface straight on, the way a front photo of the garment was taken. */
function projectFront(geometry: BufferGeometry, panel: FrontPanel) {
  const position = geometry.getAttribute('position')
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = (position.getX(i) - panel.minX) / (panel.maxX - panel.minX)
    uv[i * 2 + 1] = (position.getY(i) - panel.minY) / (panel.maxY - panel.minY)
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('Garment parts have mismatched attributes')
  return merged
}

function finish(frontParts: BufferGeometry[], restParts: BufferGeometry[]): GarmentGeometry {
  const front = merge(frontParts)
  const rest = merge(restParts)
  front.computeBoundingBox()
  const box = front.boundingBox!
  const panel = { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y }
  projectFront(front, panel)
  return { front, rest, panel }
}

export function buildGarmentGeometry(templateId: GarmentTemplateId, shape: BodyShape): GarmentGeometry {
  switch (templateId) {
    case 'shirt-long-sleeve':
      return shirtGeometry(shape, 'long')
    case 'shirt-short-sleeve':
      return shirtGeometry(shape, 'short')
    case 'trousers-straight':
      return trousersGeometry(shape)
  }
}
