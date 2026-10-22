import { BufferGeometry, Float32BufferAttribute, SphereGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GarmentTemplateId } from '../../garments/garment.types'
import { limbTransform, SHOULDER_SQUASH, SIDES, type BodyShape, type Side } from '../body-shape'
import { buildLoft, inflateRings, ringAt, sliceRings, TAU, type LoftUv, type Ring } from './loft'

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
 * seam. `offset`, plus any shift of the ring's centre, places the line in
 * the fabric. Along: the distance down the limb, or for a trouser leg the
 * height in the world, as on the seat.
 */
function limbSwatchUv(centre: number, along: 'limb' | 'height', offset = 0): LoftUv {
  return (world, theta, ring) => [
    offset + (ring.cx ?? 0) + ((theta - centre) * (ring.rx + ring.rz)) / 2,
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

/**
 * Trousers hang closer than shirts (fabric may slope in faster below a belly
 * or seat), so an untucked shirt always falls outside them.
 */
export const TROUSER_DRAPE = 0.25
/** How far below the body's crotch the trouser legs finish parting, so the crotch stays covered. */
export const CROTCH_DROP = 0.07
/**
 * Near the seat the two legs lie almost on one another. Each sits this much
 * towards its own side, so the right leg always shows on the right and the
 * left on the left, rather than the two flickering through each other.
 */
const LEG_SIDEWAYS = 0.001

/** The height of the seat's fullest ring, below which the trousers part into legs. */
export function seatBottomY(shape: BodyShape): number {
  let fullest = shape.torso[0]
  for (const ring of shape.torso) if (ring.y <= HIP_Y && ring.rx > fullest.rx) fullest = ring
  return fullest.y
}

/**
 * The trousers' seat and waist, from the seat's fullest ring up to the
 * waistband, falling from the seat and belly instead of tucking in under them.
 */
export function trouserSeatRings(shape: BodyShape): TorsoProfile {
  const rings = sliceRings(shape.torso, seatBottomY(shape), TROUSER_WAIST_Y, 14)
  return hang(inflateRings(rings, TROUSER_WAIST_EASE), TROUSER_DRAPE)
}

/** A trouser's size at a height: its centre and half-width across, and how far its front and back reach. */
interface Extents {
  cz: number
  rx: number
  front: number
  back: number
}

/** How far below the seat the legs carry on the seat's own slopes before levelling off. */
const SEAT_RUN_ON = 0.04

/**
 * The seat's extents at a height. Below its fullest ring each one carries on
 * the way the seat was going (in, falling from a belly, or out, still
 * rounding over the seat), easing off over SEAT_RUN_ON, so the legs take
 * over without a crease.
 */
function seatExtents(seat: TorsoProfile): (y: number) => Extents {
  const extents = (front: Ring, back: Ring): Extents => ({
    cz: front.cz ?? 0,
    rx: front.rx,
    front: (front.cz ?? 0) + front.rz,
    back: (back.cz ?? 0) - back.rz,
  })
  const [bottom, above] = [0, 1].map((i) => extents(seat.front[i], seat.back[i]))
  const [seatY, rise] = [seat.front[0].y, seat.front[1].y - seat.front[0].y]
  return (y) => {
    if (y >= seatY) return extents(ringAt(seat.front, y), ringAt(seat.back, y))
    const fall = (SEAT_RUN_ON * (1 - Math.exp(-(seatY - y) / SEAT_RUN_ON))) / rise
    const on = (key: keyof Extents) => bottom[key] + (bottom[key] - above[key]) * fall
    return { cz: bottom.cz, rx: on('rx'), front: on('front'), back: on('back') }
  }
}

/**
 * Where a full figure's thigh bulges past the seat's outline, just below the
 * hip, a leg ring widens round it instead of squeezing it: out to the side,
 * where the bulge is, and only front to back if the thigh reaches past the
 * ring's front or back. All in the leg's frame, `thigh` round its axis.
 */
function roomForThigh(thigh: Ring, ring: { cx: number; cz: number; rx: number; frontRz: number; backRz: number }) {
  const { cx, cz, rx, frontRz, backRz } = ring
  let [wide, deep] = [rx, 1]
  for (let k = 0; k < 32; k++) {
    const theta = (k / 32) * TAU
    const [x, z] = [thigh.rx * Math.cos(theta), (thigh.cz ?? 0) + thigh.rz * Math.sin(theta)]
    const across = ((z - cz) / (z >= cz ? frontRz : backRz)) ** 2
    if (across < 0.9) wide = Math.max(wide, Math.abs(x - cx) / Math.sqrt(1 - across))
    else deep = Math.max(deep, Math.sqrt(((x - cx) / rx) ** 2 + across))
  }
  return { rx: Math.max(wide, rx * deep), frontRz: frontRz * deep, backRz: backRz * deep }
}

/** Where the trouser legs finish parting, and where they meet the seat. */
function legParting(shape: BodyShape) {
  return { partY: shape.torso[0].y - CROTCH_DROP, seatY: seatBottomY(shape) }
}

/**
 * How far a trouser leg ring, at a given distance down the leg, has grown
 * into the seat: 0 where the legs have parted, 1 at the seat.
 */
function intoSeat(shape: BodyShape, d: number) {
  const { partY, seatY } = legParting(shape)
  return smoothstep(partY, seatY, shape.leg.joint[1] - d * Math.cos(shape.leg.abduction))
}

/**
 * A leg's rings lie square to the leg, so they tilt with it; the seat's lie
 * level. As a leg grows into the seat, its rings are levelled to match (by
 * shearing each one round its centre), so the leg follows the seat at every
 * point of a ring, not just at its centre. Normals and, on the back, the
 * swatch's height follow. `leg` is the right leg's profile.
 */
function levelLeg(geometry: BufferGeometry, shape: BodyShape, leg: TorsoProfile, side: Side, swatch: boolean) {
  const [jointX] = shape.leg.joint
  const [cos, sin, tan] = [Math.cos, Math.sin, Math.tan].map((f) => f(shape.leg.abduction))
  const toLeg = limbTransform(shape.leg, side).invert()
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  const point = new Vector3()
  const facing = new Vector3()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)
    const d = -point.clone().applyMatrix4(toLeg).y
    const shear = tan * side * intoSeat(shape, d)
    if (shear === 0) continue
    // Where the ring's centre is across the body.
    const centre = side * (jointX + d * sin + (ringAt(leg.front, -d).cx ?? 0) * cos)
    position.setY(i, point.y - (point.x - centre) * shear)
    facing.fromBufferAttribute(normal, i)
    facing.x += shear * facing.y
    facing.normalize()
    normal.setXYZ(i, facing.x, facing.y, facing.z)
    if (swatch) uv.setY(i, position.getY(i))
  }
}

/**
 * The right trouser leg in its own frame, rings from the hem up, as a front
 * and a back half-profile. Below where the legs part it is a straight leg.
 * From there up it grows smoothly into the seat: its side, front and back
 * move out to the seat's, and its inside crosses over to the far side of the
 * seat, so at the seat's fullest ring the leg is the seat, and the legs and
 * seat make one surface with no ledge. Where the legs overlap, each one's
 * inside is within the other leg, out of sight, and the notch between them
 * deepens into the crotch. The top ring is the seat's bottom ring.
 * The left leg is its mirror image: negate cx.
 */
export function trouserLegRings(shape: BodyShape): TorsoProfile {
  const { leg } = shape
  const [jointX, jointY] = leg.joint
  const [cos, sin] = [Math.cos(leg.abduction), Math.sin(leg.abduction)]
  const seat = trouserSeatRings(shape)
  const { partY, seatY } = legParting(shape)
  // Distance down the leg's axis to a height.
  const down = (y: number) => (jointY - y) / cos
  const plain = straightLeg(
    inflateRings(
      [
        ...sliceRings(leg.rings, -(leg.length - 0.04), -down(partY), 20),
        ...sliceRings(leg.rings, -down(partY), -down(seatY), 20).slice(1),
      ],
      TROUSER_EASE,
    ),
  )
  const seatAt = seatExtents(seat)
  // Each ring's height, where the leg's axis is across the body there, and
  // its extents across the body (x) and front to back (z), on the way to the seat's.
  const spans = plain.map((ring) => {
    const d = -ring.y
    const y = jointY - d * cos
    const axis = jointX + d * sin
    const t = smoothstep(partY, seatY, y)
    const target = seatAt(y)
    const toSeat = (own: number, to: number) => own + (to - own) * t
    const cz = ring.cz ?? 0
    return {
      y,
      axis,
      t,
      cz: toSeat(cz, target.cz),
      outer: toSeat(axis + ring.rx, target.rx),
      inner: toSeat(axis - ring.rx, -target.rx),
      front: toSeat(cz + ring.rz, target.front),
      back: toSeat(cz - ring.rz, target.back),
    }
  })
  // Like the seat itself, the front and back fall from the seat and belly
  // instead of tucking in under them.
  for (let i = spans.length - 2; i >= 0; i--) {
    const give = TROUSER_DRAPE * (spans[i + 1].y - spans[i].y)
    spans[i].front = Math.max(spans[i].front, spans[i + 1].front - give)
    spans[i].back = Math.min(spans[i].back, spans[i + 1].back + give)
  }
  const front: Ring[] = []
  const back: Ring[] = []
  // Up to the seat the leg never narrows on the way up.
  let widest = { rx: 0, frontRz: 0, backRz: 0 }
  plain.forEach((ring, i) => {
    const { y, axis, t, cz, outer, inner } = spans[i]
    const cx = ((outer + inner) / 2 - axis) / cos
    const [thigh] = inflateRings([ringAt(leg.rings, ring.y)], TROUSER_EASE / 2)
    const size = roomForThigh(thigh, {
      cx,
      cz,
      rx: (outer - inner) / 2,
      frontRz: spans[i].front - cz,
      backRz: cz - spans[i].back,
    })
    if (y <= seatY) {
      widest = {
        rx: Math.max(widest.rx, size.rx),
        frontRz: Math.max(widest.frontRz, size.frontRz),
        backRz: Math.max(widest.backRz, size.backRz),
      }
      Object.assign(size, widest)
    }
    const shared = { y: ring.y, rx: size.rx, cx: cx + LEG_SIDEWAYS * t, cz }
    front.push({ ...shared, rz: size.frontRz })
    back.push({ ...shared, rz: size.backRz })
  })
  return { front, back }
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

/**
 * Moves each leg loft's top ring onto the seat loft's bottom ring, point for
 * point, so they share an edge: no gap, overlap or ledge shows where the legs
 * meet the seat. The legs' levelled top rings already lie there, to within
 * rounding and each leg's slight step to its own side. On the back the
 * swatch's fabric is carried across the join too.
 * Each loft's normals along that edge lean only its own way, the seat's up and
 * the legs' down, so the edge takes one normal shared by all of them, halfway
 * between the seat's and that of the leg that shows there (the right leg on
 * the right, the left on the left, both on the centre line), and the join
 * doesn't show as a line in the light. `legs` follows SIDES.
 */
function meetSeat(seat: BufferGeometry, legs: BufferGeometry[], swatch: boolean) {
  const [seatPosition, seatNormal, seatUv] = ['position', 'normal', 'uv'].map((name) => seat.getAttribute(name))
  const columns = TROUSER_SEGMENTS + 1
  const shared = new Vector3()
  const legNormal = new Vector3()
  const showing = new Vector3()
  for (let j = 0; j < columns; j++) {
    const x = seatPosition.getX(j)
    showing.set(0, 0, 0)
    legs.forEach((leg, k) => {
      const normal = leg.getAttribute('normal')
      if (x * SIDES[k] >= -1e-6) showing.add(legNormal.fromBufferAttribute(normal, normal.count - columns + j))
    })
    shared.fromBufferAttribute(seatNormal, j).add(showing.normalize()).normalize()
    seatNormal.setXYZ(j, shared.x, shared.y, shared.z)
    for (const leg of legs) {
      const [position, normal, uv] = ['position', 'normal', 'uv'].map((name) => leg.getAttribute(name))
      const i = position.count - columns + j
      position.setXYZ(i, x, seatPosition.getY(j), seatPosition.getZ(j))
      normal.setXYZ(i, shared.x, shared.y, shared.z)
      if (swatch) uv.setXY(i, seatUv.getX(j), seatUv.getY(j))
    }
  }
}

/** Points round each half of the trousers: the seat's and the legs' match, so their edges meet. */
const TROUSER_SEGMENTS = 40

function trousersGeometry(shape: BodyShape): GarmentGeometry {
  const seat = trouserSeatRings(shape)
  const seatFront = buildLoft(seat.front, { radialSegments: TROUSER_SEGMENTS, ...FRONT_HALF })
  const seatBack = buildLoft(seat.back, { radialSegments: TROUSER_SEGMENTS, ...BACK_HALF, uv: torsoSwatchUv })
  const legFronts: BufferGeometry[] = []
  const legBacks: BufferGeometry[] = []

  const leg = trouserLegRings(shape)
  for (const side of SIDES) {
    const transform = limbTransform(shape.leg, side)
    const mirror = (rings: Ring[]) => rings.map((ring) => ({ ...ring, cx: (ring.cx ?? 0) * side }))
    const legFront = buildLoft(mirror(leg.front), { radialSegments: TROUSER_SEGMENTS, ...FRONT_HALF, transform })
    // Measured from the centre of the back of the leg, placed where that line
    // sits across the body, so the leg's fabric carries on from the seat's.
    const uv = limbSwatchUv(1.5 * Math.PI, 'height', side * shape.leg.joint[0])
    const legBack = buildLoft(mirror(leg.back), { radialSegments: TROUSER_SEGMENTS, ...BACK_HALF, transform, uv })
    levelLeg(legFront, shape, leg, side, false)
    levelLeg(legBack, shape, leg, side, true)
    legFronts.push(legFront)
    legBacks.push(legBack)
  }
  meetSeat(seatFront, legFronts, false)
  meetSeat(seatBack, legBacks, true)

  return finish([seatFront, ...legFronts], [seatBack, ...legBacks])
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
