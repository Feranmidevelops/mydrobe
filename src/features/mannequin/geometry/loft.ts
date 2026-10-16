import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three'

/** One elliptical cross-section of a loft, in the loft's local frame. */
export interface Ring {
  /** Position along the loft axis (local y). Rings must be in ascending y. */
  y: number
  /** Half-width along local x. */
  rx: number
  /** Half-depth along local z. */
  rz: number
  /** Centre offset along local x. */
  cx?: number
  /** Centre offset along local z, e.g. a belly or seat that sits off-axis. */
  cz?: number
}

export type LoftUv = (world: Vector3, theta: number, ring: Ring, ringIndex: number) => [number, number]

export interface LoftOptions {
  radialSegments: number
  /** Start angle measured from +x towards +z, so π/2 faces the front. */
  thetaStart?: number
  thetaLength?: number
  capStart?: boolean
  capEnd?: boolean
  /** Applied to positions and normals after the loft is built. */
  transform?: Matrix4
  /** Receives the transformed (world) position, so UVs can be projected in body space. */
  uv?: LoftUv
}

export const TAU = Math.PI * 2

/**
 * Sweeps a series of ellipses into a surface. Normals are derived from the
 * analytic tangents rather than averaged faces, so two partial lofts that
 * share a seam (a front and back panel) shade without a visible crease.
 */
export function buildLoft(rings: Ring[], options: LoftOptions): BufferGeometry {
  const {
    radialSegments,
    thetaStart = 0,
    thetaLength = TAU,
    capStart = false,
    capEnd = false,
    transform,
    uv,
  } = options
  if (rings.length < 2) throw new Error('A loft needs at least two rings')

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const point = new Vector3()
  const world = new Vector3()
  const normal = new Vector3()
  const alongTheta = new Vector3()
  const alongAxis = new Vector3()
  const columns = radialSegments + 1

  function pushVertex(theta: number, ring: Ring, ringIndex: number) {
    positions.push(point.x, point.y, point.z)
    normals.push(normal.x, normal.y, normal.z)
    world.copy(point)
    if (transform) world.applyMatrix4(transform)
    const [u, v] = uv
      ? uv(world, theta, ring, ringIndex)
      : [(theta - thetaStart) / thetaLength, ringIndex / (rings.length - 1)]
    uvs.push(u, v)
  }

  function setRingPoint(ring: Ring, theta: number) {
    point.set(
      (ring.cx ?? 0) + ring.rx * Math.cos(theta),
      ring.y,
      (ring.cz ?? 0) + ring.rz * Math.sin(theta),
    )
  }

  rings.forEach((ring, i) => {
    const prev = rings[Math.max(i - 1, 0)]
    const next = rings[Math.min(i + 1, rings.length - 1)]
    for (let j = 0; j <= radialSegments; j++) {
      const theta = thetaStart + (j / radialSegments) * thetaLength
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      setRingPoint(ring, theta)
      alongTheta.set(-ring.rx * sin, 0, ring.rz * cos)
      alongAxis.set(
        (next.cx ?? 0) - (prev.cx ?? 0) + (next.rx - prev.rx) * cos,
        next.y - prev.y,
        (next.cz ?? 0) - (prev.cz ?? 0) + (next.rz - prev.rz) * sin,
      )
      normal.crossVectors(alongAxis, alongTheta).normalize()
      pushVertex(theta, ring, i)
    }
  })

  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * columns + j
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  function addCap(ringIndex: number, facing: 1 | -1) {
    const ring = rings[ringIndex]
    const center = positions.length / 3
    normal.set(0, facing, 0)
    point.set(ring.cx ?? 0, ring.y, ring.cz ?? 0)
    pushVertex(thetaStart, ring, ringIndex)
    for (let j = 0; j <= radialSegments; j++) {
      const theta = thetaStart + (j / radialSegments) * thetaLength
      setRingPoint(ring, theta)
      pushVertex(theta, ring, ringIndex)
    }
    for (let j = 0; j < radialSegments; j++) {
      const v0 = center + 1 + j
      if (facing < 0) indices.push(center, v0, v0 + 1)
      else indices.push(center, v0 + 1, v0)
    }
  }

  if (capStart) addCap(0, -1)
  if (capEnd) addCap(rings.length - 1, 1)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  if (transform) geometry.applyMatrix4(transform)
  return geometry
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)
  )
}

/** Interpolates a few hand-placed key rings into a smooth profile. */
export function smoothRings(keys: Ring[], samplesPerSpan: number): Ring[] {
  const at = (i: number) => keys[Math.min(Math.max(i, 0), keys.length - 1)]
  const channel = (ring: Ring, key: keyof Ring) => ring[key] ?? 0
  const rings: Ring[] = []
  for (let i = 0; i < keys.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan
      const mix = (key: keyof Ring) =>
        catmullRom(channel(p0, key), channel(p1, key), channel(p2, key), channel(p3, key), t)
      rings.push({ y: mix('y'), rx: mix('rx'), rz: mix('rz'), cx: mix('cx'), cz: mix('cz') })
    }
  }
  rings.push({ cx: 0, cz: 0, ...keys[keys.length - 1] })
  return rings
}

/** Linearly samples a ring profile at height y, clamping outside its range. */
export function ringAt(rings: Ring[], y: number): Ring {
  if (y <= rings[0].y) return { ...rings[0], y }
  const last = rings[rings.length - 1]
  if (y >= last.y) return { ...last, y }
  let i = 1
  while (rings[i].y < y) i++
  const a = rings[i - 1]
  const b = rings[i]
  const t = (y - a.y) / (b.y - a.y)
  const lerp = (p: number, q: number) => p + (q - p) * t
  return {
    y,
    rx: lerp(a.rx, b.rx),
    rz: lerp(a.rz, b.rz),
    cx: lerp(a.cx ?? 0, b.cx ?? 0),
    cz: lerp(a.cz ?? 0, b.cz ?? 0),
  }
}

/** Grows every ring outward by a fixed distance, e.g. to wrap fabric around a body. */
export function inflateRings(rings: Ring[], offset: number): Ring[] {
  return rings.map((ring) => ({ ...ring, rx: ring.rx + offset, rz: ring.rz + offset }))
}

/** Evenly spaced samples of a profile between two heights. */
export function sliceRings(rings: Ring[], fromY: number, toY: number, count: number): Ring[] {
  return Array.from({ length: count }, (_, i) => ringAt(rings, fromY + ((toY - fromY) * i) / (count - 1)))
}
