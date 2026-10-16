import { BufferGeometry, Matrix4, Quaternion, SphereGeometry, Vector3, type Vector3Tuple } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { limbPoint, limbTransform, SHOULDER_SQUASH, SIDES, type BodyShape } from '../body-shape'
import { buildLoft } from './loft'

function ellipsoid(matrix: Matrix4, widthSegments = 32, heightSegments = 20): BufferGeometry {
  return new SphereGeometry(1, widthSegments, heightSegments).applyMatrix4(matrix)
}

function placed(center: Vector3, radii: Vector3Tuple, rotation = new Quaternion()): Matrix4 {
  return new Matrix4().compose(center, rotation, new Vector3(...radii))
}

/** Builds the whole figure as one merged mesh, so it costs a single draw call. */
export function buildMannequinGeometry(shape: BodyShape): BufferGeometry {
  const parts: BufferGeometry[] = [
    buildLoft(shape.torso, { radialSegments: 48, capStart: true, capEnd: true }),
    buildLoft(shape.neck, { radialSegments: 24, capEnd: true }),
    ellipsoid(placed(new Vector3(...shape.head.center), shape.head.radii), 40, 28),
  ]

  for (const side of SIDES) {
    const arm = limbTransform(shape.arm, side)
    const [jx, jy, jz] = shape.arm.joint
    parts.push(
      buildLoft(shape.arm.rings, { radialSegments: 24, capStart: true, transform: arm }),
      ellipsoid(
        placed(new Vector3(jx * side, jy, jz), [
          shape.shoulderRadius,
          shape.shoulderRadius * SHOULDER_SQUASH,
          shape.shoulderRadius,
        ]),
      ),
      ellipsoid(
        arm.clone().multiply(new Matrix4().compose(
          new Vector3(0, -shape.hand.d, 0),
          new Quaternion(),
          new Vector3(...shape.hand.radii),
        )),
        20,
        14,
      ),
    )

    const leg = limbTransform(shape.leg, side)
    const ankle = limbPoint(shape.leg, side, shape.leg.length)
    const [, footHeight] = shape.foot.radii
    const toeOut = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.1 * side)
    parts.push(
      buildLoft(shape.leg.rings, { radialSegments: 28, capStart: true, capEnd: true, transform: leg }),
      ellipsoid(
        placed(new Vector3(ankle.x, footHeight, ankle.z + shape.foot.forward), shape.foot.radii, toeOut),
        24,
        14,
      ),
    )
  }

  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('Mannequin parts have mismatched attributes')
  return merged
}
