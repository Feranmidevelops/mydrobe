import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GarmentTemplateId } from '../../garments/garment.types'
import { limbTransform, SHOULDER_SQUASH, SIDES, type BodyShape, type Side } from '../body-shape'
import { buildLoft, inflateRings, ringAt, sliceRings, type LoftUv, type Ring } from './loft'

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
/** How far a shirt's neckline stands off the neck, and its shoulders off the top of the torso. */
export const NECK_EASE = 0.004
/** How far up the neck a shirt's neckband reaches above the top of the torso. */
export const NECKBAND_RISE = 0.006
/** From this height the shirt's ease closes in towards the neck. */
const NECK_TAPER_Y = 1.43
const HIP_Y = 0.95

const FRONT_HALF = { thetaStart: 0, thetaLength: Math.PI }
const BACK_HALF = { thetaStart: Math.PI, thetaLength: Math.PI }

/** Torso fabric: arc length measured from the centre back, and height. */
const torsoSwatchUv: LoftUv = (world, theta, ring) => [
  ((theta - 1.5 * Math.PI) * (ring.rx + ring.rz)) / 2,
  world.y,
]

/**
 * Sleeve and leg fabric. Across: arc length round the limb from a centre
 * line at angle `centre`, so that line keeps one place in the fabric however
 * much the limb narrows, and the narrowing gathers at the far side, at the
 * seam. `offset` places the line in the fabric. Along: the distance down the
 * limb, or for a trouser leg the height in the world, as on the seat.
 */
function limbSwatchUv(centre: number, along: 'limb' | 'height', offset = 0): LoftUv {
  return (world, theta, ring) => [
    offset + ((theta - centre) * (ring.rx + ring.rz)) / 2,
    along === 'limb' ? ring.y : world.y,
  ]
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Puts the sleeve seam on the side facing the body. */
function seamTowardsBody(side: Side) {
  return side > 0 ? Math.PI : 0
}

/** A sleeve's centre line in the fabric: the outer line of the arm, facing away from the body. */
function outerLine(side: Side) {
  return seamTowardsBody(side) + Math.PI
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

/**
 * The shirt's neckline: a short band up the neck from the top of the torso,
 * standing just off it, so the shirt closes round the neck like a crew neck.
 */
function shirtNeckline(shape: BodyShape): Ring {
  const y = shape.torso[shape.torso.length - 1].y + NECKBAND_RISE
  return inflateRings([ringAt(shape.neck, y)], NECK_EASE)[0]
}

/**
 * A shirt's torso from the hem up to its neckline. Over the body it stands
 * SHIRT_EASE clear, closing in over the top of the shoulders to NECK_EASE,
 * so it meets the neck instead of leaving the top of the torso bare.
 */
export function shirtTorsoRings(shape: BodyShape, sleeve: 'long' | 'short'): TorsoProfile {
  const hemY = SHIRT_HEM_Y[sleeve]
  const topY = shape.torso[shape.torso.length - 1].y
  const body = sliceRings(shape.torso, hemY, topY, 30).map((ring) => {
    const ease = SHIRT_EASE + (NECK_EASE - SHIRT_EASE) * smoothstep(NECK_TAPER_Y, topY, ring.y)
    return inflateRings([ring], ease)[0]
  })
  const { front, back } = hang([...body, shirtNeckline(shape)])
  const flare = (ring: Ring) => inflateRings([ring], SHIRT_HEM_FLARE * smoothstep(HIP_Y, hemY, ring.y))[0]
  return { front: front.map(flare), back: back.map(flare) }
}

/**
 * The inside of a shirt's neckband: it turns in from the top edge and down
 * onto the neck, closing the gap between them, so the top of the torso never
 * shows through it, even looking down from above. `neckline` is the shirt's top ring.
 */
export function neckFacing(shape: BodyShape, neckline: Ring): BufferGeometry {
  // Down to halfway between the neckline and the top of the torso, just inside the neck.
  const y = neckline.y - NECKBAND_RISE / 2
  const [onNeck] = inflateRings([ringAt(shape.neck, y)], -0.001)
  // As many points round as the shirt's front and back together, so the edges meet exactly.
  return buildLoft([onNeck, neckline], { radialSegments: 80, uv: torsoSwatchUv })
}

/**
 * A straight trouser leg, rings from the hem up: going up it never narrows
 * until the thigh's widest point, so it falls from the thigh past the knee to
 * the hem instead of pinching in above the knee and stepping out below it.
 * The corner where the thigh takes over is softened across a ring either side.
 * Above the widest point it follows the thigh into the hip.
 */
function straightLeg(rings: Ring[]): Ring[] {
  const widest = rings.reduce((best, ring, i) => (ring.rx > rings[best].rx ? i : best), 0)
  let rx = 0
  let rz = 0
  const straight = rings.map((ring, i) => {
    if (i > widest) return ring
    rx = Math.max(rx, ring.rx)
    rz = Math.max(rz, ring.rz)
    return { ...ring, rx, rz }
  })
  return straight.map((ring, i) => {
    if (i === 0 || i >= widest) return ring
    const [below, above] = [straight[i - 1], straight[i + 1]]
    const soften = (key: 'rx' | 'rz') => (below[key] + 2 * ring[key] + above[key]) / 4
    return { ...ring, rx: soften('rx'), rz: soften('rz') }
  })
}

export function trouserLegRings(shape: BodyShape): Ring[] {
  const hemD = shape.leg.length - 0.04
  return straightLeg(inflateRings(sliceRings(shape.leg.rings, -hemD, 0, 26), TROUSER_EASE))
}

/** How far a sleeve's cap sits above the top of the shoulder; fabric lies flat there, with no ease. */
export const SHOULDER_TOP_EASE = 0.005

/** A sleeve in the arm's own frame, from the cuff up to the shoulder joint. */
export function sleeveRings(shape: BodyShape, sleeve: 'long' | 'short'): Ring[] {
  const sleeveLength = sleeve === 'long' ? shape.arm.length - 0.03 : 0.2
  return sliceRings(shape.arm.rings, -sleeveLength, 0, 14).map((ring) => {
    const towardsCuff = -ring.y / sleeveLength
    const ease = sleeve === 'long' ? 0.012 : 0.016 + 0.014 * towardsCuff
    return inflateRings([ring], ease)[0]
  })
}

/** Distance over a quarter ellipse of half-width `r` and height `h`, from its rim up to `elevation`. */
function arcUp(r: number, h: number, elevation: number) {
  const STEPS = 16
  let length = 0
  for (let i = 0; i < STEPS; i++) {
    const t = ((i + 0.5) / STEPS) * elevation
    length += Math.hypot(r * Math.sin(t), h * Math.cos(t)) * (elevation / STEPS)
  }
  return length
}

/**
 * A shirt's cap over one shoulder: a dome on top of the sleeve, tilted with
 * the arm and sharing the sleeve's opening, so the two meet without a ledge.
 * Its fabric runs on from the sleeve's: the same way round the arm, from the
 * same outer line, and measured over the dome in metres, so a check or stripe
 * carries on across the join unstretched. `sleeveTop` is the sleeve's top
 * ring, in the arm's own frame.
 */
export function shoulderCap(shape: BodyShape, side: Side, sleeveTop: Ring): BufferGeometry {
  const height = shape.shoulderRadius * SHOULDER_SQUASH + SHOULDER_TOP_EASE
  const seam = seamTowardsBody(side)
  // The sphere's own seam is turned to lie along the sleeve's.
  const dome = new SphereGeometry(1, 24, 8, Math.PI - seam, Math.PI * 2, 0, Math.PI / 2)
  const position = dome.getAttribute('position')
  const uv = dome.getAttribute('uv')
  const radius = (sleeveTop.rx + sleeveTop.rz) / 2
  for (let i = 0; i < uv.count; i++) {
    // The angle round the arm the sleeve's loft would give this point.
    const theta = seam + Math.PI * 2 * (1 - uv.getX(i))
    const elevation = Math.asin(Math.min(1, position.getY(i)))
    uv.setXY(i, (theta - outerLine(side)) * radius, sleeveTop.y + arcUp(radius, height, elevation))
  }
  return dome
    .scale(sleeveTop.rx, height, sleeveTop.rz)
    .translate(sleeveTop.cx ?? 0, sleeveTop.y, sleeveTop.cz ?? 0)
    .applyMatrix4(limbTransform(shape.arm, side))
}

/** How far a shirt collar stands above the neckline at the back and, were it closed, at the front. */
export const COLLAR = { backRise: 0.035, frontRise: 0.01 } as const
/** Half the angle a collar leaves open at the front, where the photo shows the real collar. */
export const COLLAR_OPENING = 0.45

/**
 * A shirt collar: a band round the back and sides of the neck that rises
 * from the shirt's neckline, so the two share an edge, stands tallest at the
 * back and slopes down towards the front, where it opens. Going up it follows
 * the neck forward and stands a little further off it. `neckline` is the shirt's top ring.
 */
export function shirtCollar(shape: BodyShape, neckline: Ring): BufferGeometry {
  const baseY = neckline.y
  const backHeight = COLLAR.backRise
  const lean = (y: number) => (ringAt(shape.neck, y).cz ?? 0) - (ringAt(shape.neck, baseY).cz ?? 0)
  const rings = Array.from({ length: 4 }, (_, i) => {
    const y = baseY + (backHeight * i) / 3
    return {
      ...neckline,
      y,
      rx: neckline.rx + i * 0.002,
      rz: neckline.rz + i * 0.002,
      cz: (neckline.cz ?? 0) + lean(y),
    }
  })
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
    const height = backHeight + (COLLAR.frontRise - COLLAR.backRise) * towardsFront
    position.setY(i, baseY + (position.getY(i) - baseY) * (height / backHeight))
  }
  return collar
}

function shirtGeometry(shape: BodyShape, sleeve: 'long' | 'short'): GarmentGeometry {
  const torso = shirtTorsoRings(shape, sleeve)
  const front = [buildLoft(torso.front, { radialSegments: 40, ...FRONT_HALF })]
  const rest = [buildLoft(torso.back, { radialSegments: 40, ...BACK_HALF, uv: torsoSwatchUv })]

  const neckline = torso.back[torso.back.length - 1]
  rest.push(neckFacing(shape, neckline))
  if (sleeve === 'long') rest.push(shirtCollar(shape, neckline))

  const rings = sleeveRings(shape, sleeve)
  for (const side of SIDES) {
    rest.push(
      buildLoft(rings, {
        radialSegments: 24,
        thetaStart: seamTowardsBody(side),
        transform: limbTransform(shape.arm, side),
        uv: limbSwatchUv(outerLine(side), 'limb'),
      }),
      shoulderCap(shape, side, rings[rings.length - 1]),
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
    // Measured from the centre of the back of the leg, placed where that line
    // sits across the body, so the leg's fabric lines up with the seat's.
    const uv = limbSwatchUv(1.5 * Math.PI, 'height', side * shape.leg.joint[0])
    rest.push(buildLoft(leg, { radialSegments: 28, ...BACK_HALF, transform, uv }))
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
