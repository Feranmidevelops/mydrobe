import { Matrix4, Vector3, type Vector3Tuple } from 'three'
import { smoothRings, type Ring } from './geometry/loft'
import type { BodyPreset } from './viewer.types'

/*
 * A faceless display-mannequin built from hand-placed cross-sections, in
 * metres with the floor at y = 0 and the figure facing +z. The medium preset
 * is the reference; small and large scale regions of it so garments built
 * from the same profile always fit whichever preset is active.
 */

type TorsoRegion = 'crotch' | 'seat' | 'belly' | 'ribs' | 'chest' | 'shoulder' | 'neck'

const TORSO_KEYS: (Ring & { region: TorsoRegion })[] = [
  { y: 0.76, rx: 0.1, rz: 0.075, cz: 0, region: 'crotch' },
  { y: 0.8, rx: 0.165, rz: 0.108, cz: -0.006, region: 'seat' },
  { y: 0.86, rx: 0.182, rz: 0.118, cz: -0.009, region: 'seat' },
  { y: 0.93, rx: 0.177, rz: 0.114, cz: -0.006, region: 'seat' },
  { y: 1.0, rx: 0.158, rz: 0.104, cz: -0.001, region: 'belly' },
  { y: 1.08, rx: 0.138, rz: 0.098, cz: 0.004, region: 'belly' },
  { y: 1.17, rx: 0.146, rz: 0.106, cz: 0.01, region: 'ribs' },
  { y: 1.25, rx: 0.16, rz: 0.114, cz: 0.016, region: 'chest' },
  { y: 1.32, rx: 0.168, rz: 0.11, cz: 0.012, region: 'chest' },
  { y: 1.38, rx: 0.165, rz: 0.095, cz: 0, region: 'shoulder' },
  { y: 1.425, rx: 0.135, rz: 0.075, cz: -0.008, region: 'shoulder' },
  { y: 1.455, rx: 0.075, rz: 0.058, cz: -0.01, region: 'neck' },
  { y: 1.47, rx: 0.052, rz: 0.05, cz: -0.008, region: 'neck' },
]

const NECK_KEYS: Ring[] = [
  { y: 1.42, rx: 0.049, rz: 0.049, cz: -0.008 },
  { y: 1.52, rx: 0.046, rz: 0.047, cz: -0.004 },
  { y: 1.6, rx: 0.044, rz: 0.045, cz: 0 },
]

interface LimbKey {
  /** Distance from the joint along the limb. */
  d: number
  /** Half-width across the limb (local x). */
  r: number
  /** Front-to-back depth as a multiple of r. */
  depth: number
  cz?: number
  region: 'upper' | 'lower'
}

// Arms hang palms-in, so the forearm and wrist are deeper than they are wide.
const ARM_KEYS: LimbKey[] = [
  { d: 0, r: 0.05, depth: 1, region: 'upper' },
  { d: 0.06, r: 0.049, depth: 1, region: 'upper' },
  { d: 0.16, r: 0.043, depth: 1, region: 'upper' },
  { d: 0.27, r: 0.037, depth: 1, region: 'upper' },
  { d: 0.31, r: 0.034, depth: 1.05, region: 'lower' },
  { d: 0.36, r: 0.035, depth: 1.1, region: 'lower' },
  { d: 0.47, r: 0.028, depth: 1.15, region: 'lower' },
  { d: 0.555, r: 0.021, depth: 1.3, region: 'lower' },
  { d: 0.57, r: 0.02, depth: 1.3, region: 'lower' },
]

// The thigh starts slimmer so its top stays tucked inside the pelvis, and the
// ankle runs down into the foot so no gap shows between them.
const LEG_KEYS: LimbKey[] = [
  { d: 0, r: 0.08, depth: 1, region: 'upper' },
  { d: 0.07, r: 0.088, depth: 0.98, region: 'upper' },
  { d: 0.2, r: 0.075, depth: 0.96, region: 'upper' },
  { d: 0.33, r: 0.057, depth: 0.95, region: 'upper' },
  { d: 0.38, r: 0.05, depth: 1, region: 'lower' },
  { d: 0.44, r: 0.052, depth: 1.05, cz: -0.004, region: 'lower' },
  { d: 0.52, r: 0.054, depth: 1.08, cz: -0.008, region: 'lower' },
  { d: 0.64, r: 0.041, depth: 1, cz: -0.004, region: 'lower' },
  { d: 0.74, r: 0.031, depth: 1, region: 'lower' },
  { d: 0.8, r: 0.028, depth: 1, region: 'lower' },
  { d: 0.84, r: 0.027, depth: 1, region: 'lower' },
]

interface RegionScale {
  rx: number
  rz: number
  /** Forward shift in metres, e.g. a fuller belly. */
  cz: number
}

interface LimbProportions {
  upper: number
  lower: number
  /** Outward swing from vertical, in radians. */
  abduction: number
  /** Multiplier on the joint's distance from the centre line. */
  spread: number
}

interface Proportions {
  scale: number
  head: number
  hand: number
  torso: Record<TorsoRegion, RegionScale>
  arm: LimbProportions
  leg: LimbProportions
}

const same: RegionScale = { rx: 1, rz: 1, cz: 0 }

const PROPORTIONS: Record<BodyPreset, Proportions> = {
  small: {
    scale: 0.97,
    head: 0.98,
    hand: 0.96,
    torso: {
      crotch: { rx: 0.92, rz: 0.92, cz: 0 },
      seat: { rx: 0.9, rz: 0.9, cz: 0 },
      belly: { rx: 0.86, rz: 0.86, cz: -0.002 },
      ribs: { rx: 0.9, rz: 0.9, cz: 0 },
      chest: { rx: 0.92, rz: 0.9, cz: 0 },
      shoulder: { rx: 0.94, rz: 0.92, cz: 0 },
      neck: { rx: 0.92, rz: 0.92, cz: 0 },
    },
    arm: { upper: 0.86, lower: 0.88, abduction: 0.15, spread: 0.93 },
    leg: { upper: 0.86, lower: 0.9, abduction: 0.035, spread: 0.9 },
  },
  medium: {
    scale: 1,
    head: 1,
    hand: 1,
    torso: {
      crotch: same,
      seat: same,
      belly: same,
      ribs: same,
      chest: same,
      shoulder: same,
      neck: same,
    },
    arm: { upper: 1, lower: 1, abduction: 0.16, spread: 1 },
    leg: { upper: 1, lower: 1, abduction: 0.03, spread: 1 },
  },
  large: {
    scale: 1,
    head: 1.03,
    hand: 1.08,
    torso: {
      crotch: { rx: 1.25, rz: 1.2, cz: 0 },
      seat: { rx: 1.3, rz: 1.34, cz: -0.006 },
      belly: { rx: 1.44, rz: 1.6, cz: 0.03 },
      ribs: { rx: 1.34, rz: 1.46, cz: 0.022 },
      chest: { rx: 1.24, rz: 1.32, cz: 0.014 },
      shoulder: { rx: 1.12, rz: 1.15, cz: 0 },
      neck: { rx: 1.14, rz: 1.14, cz: 0 },
    },
    arm: { upper: 1.4, lower: 1.22, abduction: 0.3, spread: 1.1 },
    leg: { upper: 1.4, lower: 1.22, abduction: 0.045, spread: 1.3 },
  },
}

const SHOULDER_JOINT: Vector3Tuple = [0.172, 1.385, -0.005]
const HIP_JOINT: Vector3Tuple = [0.093, 0.87, 0]

export interface Limb {
  /** Joint on the +x side; the -x side mirrors it. */
  joint: Vector3Tuple
  abduction: number
  /** Forward swing of the far end, in radians. */
  forward: number
  length: number
  /** Local profile hanging down from the joint: y = -distance, ascending. */
  rings: Ring[]
}

export interface BodyShape {
  preset: BodyPreset
  /** Uniform scale applied to the whole figure and its garments. */
  scale: number
  torso: Ring[]
  neck: Ring[]
  head: { center: Vector3Tuple; radii: Vector3Tuple }
  shoulderRadius: number
  arm: Limb
  hand: { d: number; radii: Vector3Tuple }
  leg: Limb
  foot: { radii: Vector3Tuple; forward: number }
}

export const SIDES = [1, -1] as const
export type Side = (typeof SIDES)[number]

function buildLimb(
  keys: LimbKey[],
  proportions: LimbProportions,
  joint: Vector3Tuple,
  forward: number,
): Limb {
  const rings = keys
    .map(({ d, r, depth, cz = 0, region }) => {
      const factor = proportions[region]
      return { y: -d, rx: r * factor, rz: r * depth * factor, cz }
    })
    .reverse()
  return {
    joint: [joint[0] * proportions.spread, joint[1], joint[2]],
    abduction: proportions.abduction,
    forward,
    length: keys[keys.length - 1].d,
    rings: smoothRings(rings, 4),
  }
}

export function createBodyShape(preset: BodyPreset): BodyShape {
  const p = PROPORTIONS[preset]
  const torsoKeys = TORSO_KEYS.map(({ region, ...ring }) => {
    const scale = p.torso[region]
    return { ...ring, rx: ring.rx * scale.rx, rz: ring.rz * scale.rz, cz: (ring.cz ?? 0) + scale.cz }
  })
  const neckScale = p.torso.neck.rx

  return {
    preset,
    scale: p.scale,
    torso: smoothRings(torsoKeys, 6),
    neck: NECK_KEYS.map((ring) => ({ ...ring, rx: ring.rx * neckScale, rz: ring.rz * neckScale })),
    head: {
      center: [0, 1.655, 0.008],
      radii: [0.077 * p.head, 0.108 * p.head, 0.094 * p.head],
    },
    shoulderRadius: ARM_KEYS[0].r * p.arm.upper,
    arm: buildLimb(ARM_KEYS, p.arm, SHOULDER_JOINT, 0.06),
    hand: { d: 0.645, radii: [0.018 * p.hand, 0.085 * p.hand, 0.043 * p.hand] },
    leg: buildLimb(LEG_KEYS, p.leg, HIP_JOINT, 0),
    foot: { radii: [0.04, 0.034, 0.118], forward: 0.045 },
  }
}

/** Places a limb's local frame (hanging along -y) at its joint on the given side. */
export function limbTransform(limb: Limb, side: Side): Matrix4 {
  const [x, y, z] = limb.joint
  return new Matrix4()
    .makeTranslation(x * side, y, z)
    .multiply(new Matrix4().makeRotationZ(limb.abduction * side))
    .multiply(new Matrix4().makeRotationX(-limb.forward))
}

/** World position of the point `distance` along a limb from its joint. */
export function limbPoint(limb: Limb, side: Side, distance: number): Vector3 {
  return new Vector3(0, -distance, 0).applyMatrix4(limbTransform(limb, side))
}
