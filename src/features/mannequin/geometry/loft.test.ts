import { Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildLoft, ringAt, smoothRings, type Ring } from './loft'

const cylinder: Ring[] = [
  { y: 0, rx: 1, rz: 0.5 },
  { y: 1, rx: 1, rz: 0.5 },
  { y: 2, rx: 1, rz: 0.5 },
]

function vertex(attribute: { getX(i: number): number; getY(i: number): number; getZ(i: number): number }, i: number) {
  return new Vector3(attribute.getX(i), attribute.getY(i), attribute.getZ(i))
}

describe('buildLoft', () => {
  it('creates one column of vertices per segment plus the seam', () => {
    const geometry = buildLoft(cylinder, { radialSegments: 8 })
    expect(geometry.getAttribute('position').count).toBe(3 * 9)
    expect(geometry.getIndex()!.count).toBe(2 * 8 * 6)
  })

  it('adds a fan of triangles per cap', () => {
    const geometry = buildLoft(cylinder, { radialSegments: 8, capStart: true, capEnd: true })
    expect(geometry.getAttribute('position').count).toBe(3 * 9 + 2 * 10)
    expect(geometry.getIndex()!.count).toBe(2 * 8 * 6 + 2 * 8 * 3)
  })

  it('points side normals outward and keeps them unit length', () => {
    const geometry = buildLoft(cylinder, { radialSegments: 16 })
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    for (let i = 0; i < positions.count; i++) {
      const p = vertex(positions, i)
      const n = vertex(normals, i)
      expect(n.length()).toBeCloseTo(1, 5)
      expect(n.dot(new Vector3(p.x, 0, p.z))).toBeGreaterThan(0)
    }
  })

  it('winds triangles so their face normals agree with vertex normals', () => {
    const geometry = buildLoft(cylinder, { radialSegments: 12, capStart: true, capEnd: true })
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    const index = geometry.getIndex()!
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
      const face = new Vector3()
        .subVectors(vertex(positions, b), vertex(positions, a))
        .cross(new Vector3().subVectors(vertex(positions, c), vertex(positions, a)))
      const average = vertex(normals, a).add(vertex(normals, b)).add(vertex(normals, c))
      expect(face.dot(average)).toBeGreaterThan(0)
    }
  })

  it('builds a half loft over the requested angle', () => {
    const geometry = buildLoft(cylinder, { radialSegments: 8, thetaStart: 0, thetaLength: Math.PI })
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getZ(i)).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('applies the transform and passes world positions to the uv callback', () => {
    const transform = new Matrix4().makeTranslation(5, 0, 0)
    const seen: number[] = []
    buildLoft(cylinder, {
      radialSegments: 4,
      transform,
      uv: (world) => {
        seen.push(world.x)
        return [0, 0]
      },
    })
    expect(Math.min(...seen)).toBeCloseTo(4)
    expect(Math.max(...seen)).toBeCloseTo(6)
  })
})

describe('smoothRings', () => {
  it('passes through every key ring', () => {
    const keys: Ring[] = [
      { y: 0, rx: 0.2, rz: 0.1 },
      { y: 0.5, rx: 0.3, rz: 0.15 },
      { y: 1, rx: 0.1, rz: 0.1 },
    ]
    const rings = smoothRings(keys, 4)
    expect(rings).toHaveLength(9)
    expect(rings[4]).toMatchObject({ y: 0.5, rx: 0.3, rz: 0.15 })
    expect(rings[8]).toMatchObject({ y: 1, rx: 0.1 })
  })
})

describe('ringAt', () => {
  it('interpolates between rings and clamps outside them', () => {
    const rings: Ring[] = [
      { y: 0, rx: 0.2, rz: 0.1 },
      { y: 1, rx: 0.4, rz: 0.3 },
    ]
    const middle = ringAt(rings, 0.5)
    expect(middle.y).toBe(0.5)
    expect(middle.rx).toBeCloseTo(0.3)
    expect(middle.rz).toBeCloseTo(0.2)
    expect(ringAt(rings, 2)).toMatchObject({ y: 2, rx: 0.4 })
  })
})
